export const DOWNLOAD_SCAN_KEY = "secureBrowser.downloadScans";
export const COOKIE_SCAN_KEY = "secureBrowser.cookieScans";
export const EXTENSION_SCAN_KEY = "secureBrowser.extensionScans";
export const PASSWORD_SCAN_KEY = "secureBrowser.passwordScans";
export const MAX_STORED_SCANS = 30;

function getFromChromeStorage(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(defaults, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items);
    });
  });
}

function setInChromeStorage(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function normalizeList(list) {
  return Array.isArray(list) ? list : [];
}

export async function getLatestDownloadScans() {
  const items = await getFromChromeStorage({ [DOWNLOAD_SCAN_KEY]: [] });
  return normalizeList(items[DOWNLOAD_SCAN_KEY]);
}

export async function saveDownloadScan(scan) {
  const existing = await getLatestDownloadScans();
  const next = [scan, ...existing.filter((item) => item.id !== scan.id)].slice(0, MAX_STORED_SCANS);
  await setInChromeStorage({ [DOWNLOAD_SCAN_KEY]: next });
  return scan;
}

export async function getLatestCookieScans() {
  const items = await getFromChromeStorage({ [COOKIE_SCAN_KEY]: [] });
  return normalizeList(items[COOKIE_SCAN_KEY]);
}

export async function saveCookieScan(scan) {
  const existing = await getLatestCookieScans();
  const next = [scan, ...existing.filter((item) => item.domain !== scan.domain)].slice(0, MAX_STORED_SCANS);
  await setInChromeStorage({ [COOKIE_SCAN_KEY]: next });
  return scan;
}

export async function getLatestExtensionScans() {
  const items = await getFromChromeStorage({ [EXTENSION_SCAN_KEY]: [] });
  return normalizeList(items[EXTENSION_SCAN_KEY]);
}

export async function saveExtensionScan(scan) {
  const existing = await getLatestExtensionScans();
  const next = [scan, ...existing.filter((item) => item.timestamp !== scan.timestamp)].slice(0, MAX_STORED_SCANS);
  await setInChromeStorage({ [EXTENSION_SCAN_KEY]: next });
  return scan;
}

export async function getLatestPasswordScans() {
  const items = await getFromChromeStorage({ [PASSWORD_SCAN_KEY]: [] });
  return normalizeList(items[PASSWORD_SCAN_KEY]);
}

export async function findPasswordFingerprint(hash) {
  const scans = await getLatestPasswordScans();
  return scans.find((entry) => entry.hash === hash) ?? null;
}

export async function savePasswordScan(scan) {
  const existing = await getLatestPasswordScans();
  const next = [scan, ...existing.filter((item) => item.hash !== scan.hash)].slice(0, MAX_STORED_SCANS);
  await setInChromeStorage({ [PASSWORD_SCAN_KEY]: next });
  return scan;
}
