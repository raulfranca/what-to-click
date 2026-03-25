# Documentação do What-to-click

## Visão Geral

**What-to-click** é uma extensão de navegador (atualmente compatível com o Manifest V3 do Chrome) desenvolvida para rastrear o fluxo de trabalho do usuário no navegador e gerar automaticamente uma documentação passo a passo (SOPs, tutoriais). A extensão possibilita a gravação de cliques na tela, captura recortes das telas no momento do clique (screenshots detalhadas) e utiliza IA (OCR local via Tesseract) para ler os elementos onde ocorreram as interações.

Tudo funciona de forma offline dentro do navegador com a prioridade em preservar a segurança dos dados do usuário.

---

## Arquitetura Geral e Componentes Principais

O projeto segue a estrutura padrão de Extensões do Chrome (MV3), compostas pelos seguintes blocos:

### 1. **Background Service Worker (`src/background/index.js`)**
O orquestrador principal da extensão. Ele retém o estado da "sessão" ativa e lida com mensagens vindas das abas do navegador em segundo plano.
- **Função:** Iniciar e encerrar as gravações da extensão ao ouvir os cliques da *action* (`chrome.action.onClicked`).
- **Comunicação:** Escuta os eventos despachados pelo(s) Content Script(s) (como `mousedown` e `popstate`).
- **Gerenciador de Screenshots:** Comanda a API `chrome.tabs.captureVisibleTab` e recorta o pedaço exato da tela onde o usuário interagiu.
- **Armazenamento:** Salva dados da sessão e as imagens processadas em base64 no armazenamento providenciado pelo `localforage`.

### 2. **Content Script (`src/content/index.js`)**
Um script injetado diretamente nas páginas web que o usuário acessa durante a gravação.
- **Função:** Detectar `mousedown` no documento atual para determinar a posição exata `(x, y)` e informações do elemento de destino (ex: `target.innerText`, `target.tagName`).
- **IFrames:** Há uma lógica específica implementada (por meio de `MutationObserver`) para tentar injetar e monitorar cliques dentro de IFrames de forma dinâmica, na medida do possível sem ferir as políticas CORS (`SecurityError`).
- **Notificação:** Empacota esses eventos e as dimensões atuais e repassa via `chrome.runtime.sendMessage` ao Background Service Worker.

### 3. **Página de Edição e Exportação (`src/content/page.html` e `src/content/page.js`)**
Uma interface interativa embutida na própria extensão ("Web Accessible Resource") gerada que carrega como uma aba após a gravação de uma sessão ser interrompida.
- **Função:** Reconstruir o passo-a-passo através dos dados serializados da sessão (lista de cliques + imagens retidas).
- **OCR e IA Oflfine (`src/content/page/ocr/worker.js`):** Utiliza um Web Worker (`worker@4.0.5.min.js`) alimentado pelo `tesseract` nativo no browser (`tesseract-core-simd.js`) para extrair os textos da UI onde o botão foi clicado, criando descrições de contexto ricas de forma puramente offline.
- **Minivan (`mini-van-0.3.8.min.js`):** Um leve framework reativo sem VDOM utilizado pontualmente na construção ou suporte de alguns componentes dessa interface.
- **Módulos JS (`src/content/page/dom/*` e `src/content/page/export/*`):** Divisão de scripts em pequenos módulos para gerir a inicialização (init), os scrubs das imagens e as funcionalidades de UI/Editor.

---

## Fluxo de Trabalho e Módulos de Exportação

O ciclo de vida principal de uso é desenhado da seguinte forma:

1. **Gravar (Record):** Usuário clica no ícone da extensão $\rightarrow$ O Background Script designa um novo ID de sessão (Timestamp) no `localforage` da extensão. 
2. **Interagir:** Usuários realizam as ações normais. O Content script capta e despacha os pacotes de `mousedown` para o Background, que captura a *screenshot* visível da tela, recorta na dimensão do clique (`captureAndCrop` manipulando `OffscreenCanvas`) e anexa ao Array do `localforage`.
3. **Parar e Consolidar:** Usuário clica para desativar. A extensão interrompe a escuta, troca o ícone red-circle e abre uma aba nova apontando para a renderização interna de HTML (`content/page.html?s=[session_id]`).
4. **Editar e Exportar:** Tudo vira um passo a passo interativo lido a partir do storage. Nessa página, o arquivo local de sessões permite refinamentos humanos prévios, censura de trechos (scrubs) e exportação em diferentes formatos gerenciados pela subpasta de `export/`:
   - **`html.js`**: Página estática web.
   - **`json.js`**: Despejo dos dados puros.
   - **`markdown.js`**: Relatório amigável em Markdown.
   - **`pdf.js`**: Utilizando o prompt de impressão nativo do browser.
   - **`wtc.js`**: O recarregamento e empacotamento em formato nativo (.wtc) suportado pela ferramenta em seu backoffice.

---

## Estrutura de Diretórios e Onde Encontrar o Quê

```text
c:\dev\what-to-click\
|-- amo-metadata.json      # Metadados para submissão à Mozilla Add-ons (AMO)
|-- docs/                  # Esta documentação e recursos adicionais (como assets/logo.svg)
|-- src/
|   |-- manifest.json      # Ponto de entrada p/ o navegador que lista as permissões e scripts
|   |-- background/
|   |   |-- index.js       # Background service worker (Eventos do browser e sessões)
|   |   |-- helpers/       # Utilitários (como o localforage)
|   |-- content/
|   |   |-- index.js       # O Content-Script injetado em toda webpage visitada
|   |   |-- page.html      # Página embutida do editor
|   |   |-- page.js        # Controller principal da página embutida
|   |   |-- deps/          # Dependências raw offline (mini-van, the tesseract worker)
|   |   |-- page/
|   |   |   |-- dom/       # Módulos para manipulação/renderização da interface dentro de page.html
|   |   |   |-- export/    # Lógica de "Save As..." (PDF, Markdown, HTML, WTC, etc)
|   |   |   |-- ocr/       # Rotinas do tesseract (leitura ótica para criar títulos via texto de imagem)
|   |-- icons/             # SVGs providenciados para as Chrome Actions states (record/stop)
```

## Dependências Incorporadas (`deps`)

Para lidar com os requisitos rigorosos de privacidade e evitar permissões arriscadas via rede remota, bibliotecas inteiras são dispostas junto da extensão na pasta `src/content/deps` de modo pré-empacotado:
- **Tesseract.js** (e os SimD core workers) $\rightarrow$ OCR no próprio dispositivo sem vazar tela p/ servidores.
- **LocalForage** $\rightarrow$ API simplificada `IndexedDB` p/ guardas imagens Blob/Base64 que ultrapassam limites de Storage do Chrome convencional.
- **Mini-Van** $\rightarrow$ Utilizado para componentes UI e renderização sem custo pesado em performance.
