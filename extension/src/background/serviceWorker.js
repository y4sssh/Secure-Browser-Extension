import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import {
  getLatestEvidence,
  getRecentEvidence,
  savePageEvidence,
} from "../lib/storage/evidenceStorage";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ "secureBrowser.recentPageEvidence": [] }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isHttpUrl(tab.url)) {
    return;
  }

  requestPageScan(tabId);
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case MESSAGE_TYPES.PAGE_EVIDENCE_COLLECTED: {
      const evidence = normalizeEvidence(message.payload, sender);
      await savePageEvidence(evidence);
      return { ok: true, evidence };
    }

    case MESSAGE_TYPES.GET_LATEST_EVIDENCE: {
      return { ok: true, evidence: await getLatestEvidence() };
    }

    case MESSAGE_TYPES.GET_RECENT_EVIDENCE: {
      return { ok: true, evidence: await getRecentEvidence() };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

function normalizeEvidence(payload = {}, sender = {}) {
  const timestamp = payload.timestamp ?? new Date().toISOString();
  const url = sanitizeUrl(payload.url);

  return {
    id: `${sender.tab?.id ?? "page"}:${Date.now()}`,
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    url,
    origin: payload.origin ?? getOrigin(url),
    hostname: payload.hostname ?? getHostname(url),
    timestamp,
    trigger: payload.trigger ?? "content_script",
    signals: payload.signals ?? {},
    forms: Array.isArray(payload.forms) ? payload.forms.slice(0, 10) : [],
    scores: payload.scores ?? { finalTrustScore: 0 },
    verdict: payload.verdict ?? "unknown",
    reasons: Array.isArray(payload.reasons) ? payload.reasons.slice(0, 8) : [],
  };
}

function requestPageScan(tabId) {
  chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN }, () => {
    void chrome.runtime.lastError;
  });
}

function sanitizeUrl(value) {
  if (!value) return "";

  try {
    const parsedUrl = new URL(value);
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return "";
  }
}

function getOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
