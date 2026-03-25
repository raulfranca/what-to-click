# Work in Progress

## Status: Investigating & fixing Chrome MV3 conversion bugs

---

## Context

This repo is a Chrome MV3 extension (converted from Firefox MV2 in commit `62d373b`).
The extension tracks user workflow (mousedown events) and generates step-by-step documentation with cropped screenshots.

---

## Bugs Found & Fixed

### [FIXED] Bug 5 — `InvalidStateError: The source image could not be decoded` in `svgToImageData`
**File:** `src/background/index.js`  
**Root cause:** `createImageBitmap` cannot decode SVG blobs inside a Chrome extension service worker context — it throws `InvalidStateError` regardless of how the blob is sourced. Fetching the SVG via `chrome.runtime.getURL` still produces an SVG blob which `createImageBitmap` can't handle.  
**Fix:** Removed `svgToImageData` entirely. Replaced with `makeIconImageData(type)` which draws the two icon states (red hollow circle = recording idle, red filled square = recording live) directly onto an `OffscreenCanvas` without loading any file.

### [FIXED] Bug 6 — `TypeError: Cannot read properties of undefined (reading 'sendMessage')` in content script
**File:** `src/content/index.js`  
**Root cause:** When the extension is reloaded while a tab is already open, the old content script loses its extension context — the `chrome` global becomes `undefined`. Calling `chrome.runtime.sendMessage` then throws a TypeError instead of the expected extension API error.  
**Fix:** Added `if (typeof chrome === 'undefined' || !chrome.runtime) return null;` guard at the top of `sendMessageToBg`.

### [FIXED] Bug 3 — `SyntaxError: Identifier 'bytes' already declared` → service worker fails to register (status 15)
**File:** `src/background/index.js` — `captureAndCrop()`  
**Root cause:** Bug 1 fix introduced `const bytes` for input decoding, but the original code already had `const bytes` for output encoding in the same function scope — `const` doesn't allow redeclaration.  
**Fix:** Renamed input decoding variable to `inputBytes`.

### [FIXED] Bug 4 — SVG icons crash `setIcon` API
**File:** `src/background/index.js` — `chrome.action.onClicked` listener  
**Symptom:** `Failed to set icon '/icons/stop.svg': The source image could not be decoded.`  
**Root cause:** `chrome.action.setIcon({ path })` does not support SVG files — only PNG or ImageData.  
**Fix:** Added `svgToImageData(iconPath)` helper that fetches the SVG via `chrome.runtime.getURL`, renders it to an `OffscreenCanvas`, and returns `ImageData`. Both `setIcon` calls now pass `{ imageData: ... }`.

### [FIXED] Bug 1 — Screenshots never captured: `fetch(data:URL)` fails in service worker
**File:** `src/background/index.js` — `captureAndCrop()`  
**Symptom:** Clicking the extension starts recording (badge = "live"), but after stopping, no editor tab opens. Nothing appears to happen.  
**Root cause:** `chrome.tabs.captureVisibleTab` returns a `data:image/jpeg;base64,...` URL. The subsequent `fetch(dataUrl)` call is unreliable in Chrome extension service workers — it throws silently, the message handler's `.catch` swallows the error, the images array stays empty, and the `chrome.tabs.create` call is skipped.  
**Fix:** Replaced `fetch(dataUrl)` + `response.blob()` with direct base64 → `Uint8Array` → `Blob` decoding.

### [FIXED] Bug 2 — `localforage` undefined on editor page
**File:** `src/content/page.html`  
**Symptom:** Loading the editor page (`page.html`) breaks the fallback `.wtc` file restore (`tryFetchLocal()`).  
**Root cause:** The `<script src="localforage.min.js">` tag resolves to `content/localforage.min.js`, which doesn't exist. The actual file is at `background/helpers/localforage.min.js`.  
**Fix:** Changed `src="localforage.min.js"` → `src="../background/helpers/localforage.min.js"`.

---

## Known Architecture Notes

- **Background service worker** (`src/background/index.js`): Manages sessions via `localforage` (IndexedDB), captures screenshots, handles start/stop on `chrome.action.onClicked`.
- **Content script** (`src/content/index.js`): Listens for `mousedown` on all pages/iframes and forwards event data to the service worker.
- **Editor page** (`src/content/page.html` + `page.js`): Opened after stopping recording; fetches captured steps via `chrome.runtime.sendMessage({type:'fetchImages',...})`, falls back to local `localforage` for `.wtc` re-opens.
- **Export modules** (`src/content/page/export/`): html, json, markdown, pdf (native print), wtc.
- **OCR** (`src/content/page/ocr/worker.js`): Tesseract.js offline, runs after page load to annotate screenshots with detected words.

## Open Questions / Items to Investigate

- [ ] Validate that `captureVisibleTab` works correctly in all tab contexts (pinned tabs, hidden tabs, etc.)
- [ ] Verify that `popstate` navigation events are fully covered by `chrome.webNavigation.onCommitted` (the content script no longer dispatches `popstate` messages)
- [ ] The `.wtc` export/import flow has not been tested end-to-end on Chrome MV3

---

## Branch

`dev` — ahead of `main` only by the conversion commit and these bug fixes.
