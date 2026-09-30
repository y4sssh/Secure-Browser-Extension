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

/**
 * Requests an optional permission from the page that received the click.
 *
 * Chrome only permits this API while a user gesture is active. Keeping it in
 * the dashboard (instead of forwarding a message to the service worker)
 * makes the permission prompt reliable and lets the UI show a useful result.
 */
export function requestOptionalPermission(permission) {
  const permissions = globalThis.chrome?.permissions;
  if (!permission || !permissions?.request) {
    return Promise.resolve({ granted: false, error: "Optional permissions are unavailable in this browser." });
  }

  return new Promise((resolve) => {
    try {
      permissions.request({ permissions: [permission] }, (granted) => {
        const error = globalThis.chrome?.runtime?.lastError;
        resolve({
          granted: Boolean(granted),
          error: error?.message || "",
        });
      });
    } catch (error) {
      resolve({ granted: false, error: error?.message || "Permission request failed." });
    }
  });
}

export function hasOptionalPermission(permission) {
  const permissions = globalThis.chrome?.permissions;
  if (!permission || !permissions?.contains) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    try {
      permissions.contains({ permissions: [permission] }, (granted) => {
        void globalThis.chrome?.runtime?.lastError;
        resolve(Boolean(granted));
      });
    } catch {
      resolve(false);
    }
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
