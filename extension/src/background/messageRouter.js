import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import {
  getAlertSeverity,
  getVerdict,
  isHttpUrl,
  normalizeEvidence,
  sanitizeUrl,
} from "../lib/evidence/schema";
import {
  getLatestEvidence,
  getRecentEvidence,
  savePageEvidence,
} from "../lib/storage/evidenceStorage";
import {
  getLatestDownloadScans,
  getLatestCookieScans,
  getLatestExtensionScans,
  getLatestPasswordScans,
  runCookieScan,
  runExtensionScan,
  requestCookiePermission,
  requestManagementPermission,
  handlePasswordAnalysis,
} from "./scannerService";

const RECENT_EVIDENCE_KEY = "secureBrowser.recentPageEvidence";
const navigationByTab = new Map();

export function setupMessageRouter() {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get({ [RECENT_EVIDENCE_KEY]: [] }, () => {
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

  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener((tabId) => {
    navigationByTab.delete(tabId);
  });
}

async function handleMessage(message, sender) {
  switch (message.type) {
    case MESSAGE_TYPES.PAGE_EVIDENCE_COLLECTED: {
      const trackedRedirect = getRedirectInfo(sender.tab?.id, message.payload?.url);
      const payloadRedirectCount = getPayloadRedirectCount(message.payload);
      let evidence = normalizeEvidence(message.payload, sender, { redirect: trackedRedirect });
      evidence = applyTrackedRedirectRisk(evidence, trackedRedirect, payloadRedirectCount);
      await savePageEvidence(evidence);
      return { ok: true, evidence };
    }

    case MESSAGE_TYPES.GET_LATEST_EVIDENCE: {
      return { ok: true, evidence: await getLatestEvidence() };
    }

    case MESSAGE_TYPES.GET_RECENT_EVIDENCE: {
      return { ok: true, evidence: await getRecentEvidence() };
    }

    case MESSAGE_TYPES.GET_LATEST_DOWNLOAD_SCANS: {
      return { ok: true, scans: await getLatestDownloadScans() };
    }

    case MESSAGE_TYPES.GET_LATEST_COOKIE_SCANS: {
      return { ok: true, scans: await getLatestCookieScans() };
    }

    case MESSAGE_TYPES.GET_LATEST_EXTENSION_SCANS: {
      return { ok: true, scans: await getLatestExtensionScans() };
    }

    case MESSAGE_TYPES.GET_LATEST_PASSWORD_SCANS: {
      return { ok: true, scans: await getLatestPasswordScans() };
    }

    case MESSAGE_TYPES.RUN_COOKIE_SCAN: {
      const scan = await runCookieScan();
      return { ok: true, scan };
    }

    case MESSAGE_TYPES.RUN_EXTENSION_SCAN: {
      const scan = await runExtensionScan();
      return { ok: true, scan };
    }

    case MESSAGE_TYPES.REQUEST_COOKIE_PERMISSION: {
      const granted = await requestCookiePermission();
      return { ok: true, granted };
    }

    case MESSAGE_TYPES.REQUEST_MANAGEMENT_PERMISSION: {
      const granted = await requestManagementPermission();
      return { ok: true, granted };
    }

    case MESSAGE_TYPES.PASSWORD_ANALYSIS_COLLECTED: {
      const scan = await handlePasswordAnalysis(message.payload || {});
      return { ok: true, scan };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

function handleTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status === "loading" && isHttpUrl(tab.url)) {
    startNavigation(tabId, tab.url);
  }

  if (isHttpUrl(changeInfo.url)) {
    recordNavigationUrl(tabId, changeInfo.url);
  }

  if (changeInfo.status !== "complete" || !isHttpUrl(tab.url)) {
    return;
  }

  recordNavigationUrl(tabId, tab.url);
  markNavigationComplete(tabId);
  requestPageScan(tabId);
}

function startNavigation(tabId, url) {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;

  navigationByTab.set(tabId, {
    startedAt: Date.now(),
    complete: false,
    finalUrl: safeUrl,
    chain: [safeUrl],
  });
}

function recordNavigationUrl(tabId, url) {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;

  const current = navigationByTab.get(tabId);
  if (!current || current.complete || Date.now() - current.startedAt > 30000) {
    startNavigation(tabId, safeUrl);
    return;
  }

  const lastUrl = current.chain[current.chain.length - 1];
  if (lastUrl !== safeUrl) {
    current.chain.push(safeUrl);
  }

  current.finalUrl = safeUrl;
  navigationByTab.set(tabId, current);
}

function markNavigationComplete(tabId) {
  const current = navigationByTab.get(tabId);
  if (!current) return;
  navigationByTab.set(tabId, { ...current, complete: true });
}

function getRedirectInfo(tabId, payloadUrl) {
  const payloadSafeUrl = sanitizeUrl(payloadUrl);
  const current = navigationByTab.get(tabId);

  if (!current || (payloadSafeUrl && current.finalUrl !== payloadSafeUrl)) {
    return { count: 0, chain: [] };
  }

  return {
    count: Math.max(0, current.chain.length - 1),
    chain: current.chain,
  };
}

function applyTrackedRedirectRisk(evidence, trackedRedirect, payloadRedirectCount) {
  const trackedCount = Number.isFinite(trackedRedirect?.count) ? trackedRedirect.count : 0;
  const extraRedirectCount = Math.max(0, trackedCount - payloadRedirectCount);

  if (extraRedirectCount < 2) {
    return evidence;
  }

  const penalty = Math.min(12, extraRedirectCount * 4);
  const finalTrustScore = Math.max(0, evidence.scores.finalTrustScore - penalty);
  const reason = "Navigation followed multiple redirects before this page";
  const reasons = evidence.reasons.includes(reason)
    ? evidence.reasons
    : [reason, ...evidence.reasons].slice(0, 8);

  return {
    ...evidence,
    scores: {
      ...evidence.scores,
      finalTrustScore,
    },
    verdict: getVerdict(finalTrustScore),
    severity: getAlertSeverity(finalTrustScore),
    reasons,
  };
}

function getPayloadRedirectCount(payload = {}) {
  const signalCount = payload.signals?.redirectCount;
  const redirectCount = payload.redirect?.count;

  if (Number.isFinite(signalCount)) return signalCount;
  if (Number.isFinite(redirectCount)) return redirectCount;
  return 0;
}

function requestPageScan(tabId) {
  chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN }, () => {
    void chrome.runtime.lastError;
  });
}
