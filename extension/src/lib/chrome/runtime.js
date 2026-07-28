export function hasChromeRuntime() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

export function sendRuntimeMessage(message) {
  if (!hasChromeRuntime()) {
    return Promise.resolve({
      ok: false,
      error: "Chrome runtime is unavailable outside the extension.",
    });
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }

      resolve(response ?? { ok: true });
    });
  });
}

export function queryActiveTab() {
  if (!hasChromeRuntime() || !globalThis.chrome?.tabs?.query) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve(null);
        return;
      }

      resolve(tabs?.[0] ?? null);
    });
  });
}

export function sendTabMessage(tabId, message) {
  if (!hasChromeRuntime() || !globalThis.chrome?.tabs?.sendMessage || !tabId) {
    return Promise.resolve({ ok: false });
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }

      resolve(response ?? { ok: true });
    });
  });
}

export function openExtensionPage(pageName) {
  if (!hasChromeRuntime() || !globalThis.chrome?.tabs?.create) {
    return Promise.resolve({ ok: false });
  }

  return new Promise((resolve) => {
    chrome.tabs.create({ url: chrome.runtime.getURL(pageName) }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }

      resolve({ ok: true });
    });
  });
}
