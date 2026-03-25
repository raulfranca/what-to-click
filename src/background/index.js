importScripts('/background/helpers/localforage.min.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type = 'general', data = {} } = message;
  handleMessage(type, data, sender).then(sendResponse).catch((err) => {
    console.error(err);
    sendResponse(null);
  });
  return true;
});

async function handleMessage(type, data, sender) {
  if (type === 'mousedown') {
    const currentSession = await localforage.getItem('currentSession');
    if (currentSession == null) {
      return;
    }
    const sessionKey = `images-${currentSession}`;
    const screenshotPosition = calculateScreenshotPosition({
      x: data.x,
      y: data.y,
      scrollX: data.scrollX,
      scrollY: data.scrollY,
    }, data.documentSize, data.size);
    const image = await captureAndCrop(sender.tab.windowId, screenshotPosition, data.size);
    await localforage.setItem(
      sessionKey,
      [...await localforage.getItem(sessionKey) || [], {
        image,
        offset: screenshotPosition.offset,
        size: data.size,
        type: type,
        target: data.target,
        url: data.url,
      }]
    );
  } else if (type === 'popstate') {
    const currentSession = await localforage.getItem('currentSession');
    if (currentSession == null) {
      return;
    }
    const sessionKey = `images-${currentSession}`;
    await localforage.setItem(
      sessionKey,
      [...await localforage.getItem(sessionKey) || [], {
        type: type,
        url: data.url,
      }]
    );
  } else if (type === 'fetchImages') {
    return await localforage.getItem(`images-${data.session}`) || [];
  } else if (type === 'fetchSessions') {
    return await localforage.getItem('sessions') || [];
  }
}

chrome.action.onClicked.addListener(async () => {
  const sessionActive = await localforage.getItem('currentSession');
  if (sessionActive) {
    await localforage.setItem('currentSession', null);
    await chrome.action.setIcon({ imageData: makeIconImageData('record') });
    await chrome.action.setBadgeText({ text: '' });
    if ((await localforage.getItem(`images-${sessionActive}`)).length > 0) {
      await chrome.tabs.create({ url: `/content/page.html?s=${encodeURIComponent(sessionActive)}`, active: false });
    }
  } else {
    const session = new Date().toISOString();
    await localforage.setItem('currentSession', session);
    await localforage.setItem('sessions', [...(await localforage.getItem('sessions') || []), session]);
    await chrome.action.setIcon({ imageData: makeIconImageData('stop') });
    await chrome.action.setBadgeText({ text: 'live' });
  }
});

// createImageBitmap cannot decode SVG in a service worker context.
// Draw icons programmatically instead.
function makeIconImageData(type, size = 48) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#cc0000';
  if (type === 'record') {
    // Hollow red circle = "ready to record"
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = size * 0.12;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Filled red square = "stop recording"
    const margin = Math.round(size * 0.15);
    ctx.fillRect(margin, margin, size - margin * 2, size - margin * 2);
  }
  return ctx.getImageData(0, 0, size, size);
}

function calculateScreenshotPosition(clickPosition = { x: 0, y: 0, scrollX: 0, scrollY: 0 }, documentSize = { width: 0, height: 0 }, size = 300) {
  const x = clickPosition.x - size / 2;
  const y = clickPosition.y - size / 2;
  const rect = {
    top: y,
    left: x,
    bottom: y + size,
    right: x + size,
  };
  const documentRect = {
    top: 0,
    left: 0,
    bottom: documentSize.height,
    right: documentSize.width,
  };
  const offset = {
    top: Math.abs(Math.min(0, documentRect.top + rect.top + clickPosition.scrollY)),
    left: Math.abs(Math.min(0, documentRect.left + rect.left + clickPosition.scrollX)),
    bottom: Math.abs(Math.min(0, documentRect.bottom - rect.bottom + clickPosition.scrollY)),
    right: Math.abs(Math.min(0, documentRect.right - rect.right + clickPosition.scrollX)),
  };

  // Avoid screenshots outside the document
  const correctedX = x + offset.left - offset.right;
  const correctedY = y + offset.top - offset.bottom;

  return { x: correctedX, y: correctedY, offset };
}

async function captureAndCrop(windowId, screenshotPosition, size) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 95 });
  // fetch() with data: URLs is unreliable in Chrome extension service workers;
  // decode the base64 payload directly instead.
  const base64Data = dataUrl.split(',')[1];
  const binaryString = atob(base64Data);
  const inputBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    inputBytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([inputBytes], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, screenshotPosition.x, screenshotPosition.y, size, size, 0, 0, size, size);

  const outputBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  const buffer = await outputBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 65536;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

chrome.webNavigation.onCommitted.addListener(async (event) => {
  const currentSession = await localforage.getItem('currentSession');
  if (currentSession == null) {
    return;
  }

  if (event.transitionQualifiers.includes('forward_back')) {
    const sessionKey = `images-${currentSession}`;
    await localforage.setItem(
      sessionKey,
      [...await localforage.getItem(sessionKey) || [], {
        type: 'backNavigation',
        url: event.url,
      }]
    );
  }
});