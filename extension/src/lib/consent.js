export const CONSENT_STORAGE_KEY = "secureBrowser.consents";

export function normalizeConsentSettings(raw = {}) {
  const flat = raw?.[CONSENT_STORAGE_KEY] || {};
  const legacy = raw?.secureBrowser || {};
  const nested = legacy.consents || {};

  return {
    cloudAi: Boolean(flat.cloudAi ?? nested.cloudAi ?? legacy.cloudAi ?? false),
    hibp: Boolean(flat.hibp ?? nested.hibp ?? legacy.hibp ?? false),
    riskLockdownEnabled: Boolean(flat.riskLockdownEnabled ?? nested.riskLockdownEnabled ?? legacy.riskLockdownEnabled ?? true),
  };
}

export async function getConsentSettings() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) {
    return { cloudAi: true, hibp: true, riskLockdownEnabled: true };
  }

  const items = await new Promise((resolve) => {
    chrome.storage.local.get({ [CONSENT_STORAGE_KEY]: {}, secureBrowser: {} }, resolve);
  });

  return normalizeConsentSettings(items || {});
}

export async function setConsentSettings(nextValues = {}) {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) {
    return { cloudAi: true, hibp: true, riskLockdownEnabled: true, ...nextValues };
  }

  const items = await new Promise((resolve) => {
    chrome.storage.local.get({ [CONSENT_STORAGE_KEY]: {}, secureBrowser: {} }, resolve);
  });

  const current = normalizeConsentSettings(items || {});
  const merged = { ...current, ...nextValues };
  const flat = {
    ...(items?.[CONSENT_STORAGE_KEY] || {}),
    cloudAi: merged.cloudAi,
    hibp: merged.hibp,
    riskLockdownEnabled: merged.riskLockdownEnabled,
  };
  const secureBrowser = {
    ...(items?.secureBrowser || {}),
    cloudAi: merged.cloudAi,
    hibp: merged.hibp,
    riskLockdownEnabled: merged.riskLockdownEnabled,
    consents: {
      ...((items?.secureBrowser && items.secureBrowser.consents) || {}),
      cloudAi: merged.cloudAi,
      hibp: merged.hibp,
      riskLockdownEnabled: merged.riskLockdownEnabled,
    },
  };

  await new Promise((resolve, reject) => {
    chrome.storage.local.set({ [CONSENT_STORAGE_KEY]: flat, secureBrowser }, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Could not persist consent settings"));
        return;
      }
      resolve();
    });
  });

  return merged;
}
