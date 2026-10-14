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

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const currentEvidence = await readLatestEvidence();
    if (currentEvidence) {
      return { evidence: currentEvidence, error: "" };
    }

    const tab = await queryActiveTab();
    if (!tab?.id) {
      return { evidence: null, error: "No active tab is available to scan." };
    }

    if (!/^https?:\/\//i.test(tab.url || "")) {
      return { evidence: null, error: "This page does not support live scanning." };
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
