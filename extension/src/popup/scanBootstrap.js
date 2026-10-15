import { MESSAGE_TYPES } from "../lib/chrome/messageTypes.js";

export async function ensureLatestPageScan({
  readLatestEvidence,
  queryActiveTab,
  sendTabMessage,
  waitMs = 350,
  retries = 4,
  setStatus = () => {},
}) {
  let lastError = "";
  const tab = await queryActiveTab();

  if (!tab?.id) {
    return { evidence: null, error: "No active tab is available to scan." };
  }

  if (!/^https?:\/\//i.test(tab.url || "")) {
    return { evidence: null, error: "This page does not support live scanning." };
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const currentEvidence = await readLatestEvidence();
    if (isEvidenceForActiveTab(currentEvidence, tab)) {
      return { evidence: currentEvidence, error: "" };
    }

    setStatus(`Scanning active tab${attempt > 0 ? ` (${attempt + 1}/${retries})` : ""}`);
    const scanRequest = await sendTabMessage(tab.id, { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN });
    if (!scanRequest?.ok) {
      lastError = scanRequest?.error || "Unable to scan active tab.";
      if (attempt === retries - 1) {
        setStatus(lastError);
        return { evidence: null, error: lastError };
      }
    }

    if (typeof waitMs === "number" && waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return { evidence: null, error: lastError || "No scan available for the active tab." };
}

// Evidence is stored across all tabs. Never let a previously scanned phishing
// page appear as the assessment for the tab the user is currently viewing.
function isEvidenceForActiveTab(evidence, tab) {
  if (!evidence || evidence.tabId !== tab.id) {
    return false;
  }

  return sanitizeComparableUrl(evidence.url) === sanitizeComparableUrl(tab.url);
}

function sanitizeComparableUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}
