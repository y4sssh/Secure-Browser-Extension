import { scanPage } from "./pageScanner";

(() => {
  const MESSAGE_TYPES = {
    PAGE_EVIDENCE_COLLECTED: "secureBrowser.pageEvidenceCollected",
    REQUEST_PAGE_SCAN: "secureBrowser.requestPageScan",
  };

  function sendEvidence(trigger) {
    const payload = scanPage(trigger);

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.PAGE_EVIDENCE_COLLECTED,
        payload,
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.REQUEST_PAGE_SCAN) {
      return false;
    }

    sendEvidence("requested");
    sendResponse({ ok: true });
    return false;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => sendEvidence("dom_content_loaded"), { once: true });
  } else {
    sendEvidence("document_idle");
  }

  window.addEventListener("pageshow", () => sendEvidence("pageshow"), { once: true });
})();
