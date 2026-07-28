export const RECENT_EVIDENCE_KEY = "secureBrowser.recentPageEvidence";
export const MAX_STORED_EVIDENCE = 50;

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

export async function getRecentEvidence() {
  const items = await getFromChromeStorage({ [RECENT_EVIDENCE_KEY]: [] });
  return items[RECENT_EVIDENCE_KEY] ?? [];
}

export async function getLatestEvidence() {
  const evidence = await getRecentEvidence();
  return evidence[0] ?? null;
}

export async function savePageEvidence(evidence) {
  const recentEvidence = await getRecentEvidence();
  const nextEvidence = [
    evidence,
    ...recentEvidence.filter((item) => item.tabId !== evidence.tabId || item.url !== evidence.url),
  ].slice(0, MAX_STORED_EVIDENCE);
  await setInChromeStorage({ [RECENT_EVIDENCE_KEY]: nextEvidence });
  return evidence;
}
