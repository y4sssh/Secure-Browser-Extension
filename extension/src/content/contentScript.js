import { scanPage } from "./pageScanner";

(() => {
  const MESSAGE_TYPES = {
    PAGE_EVIDENCE_COLLECTED: "secureBrowser.pageEvidenceCollected",
    REQUEST_PAGE_SCAN: "secureBrowser.requestPageScan",
  };
  const MUTATION_DEBOUNCE_MS = 450;
  const INTERACTION_DEBOUNCE_MS = 700;
  const LOCATION_POLL_MS = 1000;
  const OBSERVED_ATTRIBUTE_FILTER = [
    "action",
    "aria-label",
    "autocomplete",
    "class",
    "formaction",
    "hidden",
    "id",
    "method",
    "name",
    "placeholder",
    "src",
    "style",
    "title",
    "type",
  ];
  const CREDENTIAL_SELECTOR =
    'form, input[type="password"], input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="email" i], textarea, select, iframe';

  const observedDocuments = new WeakSet();
  const iframeLoadListeners = new WeakSet();
  const observers = [];
  let pendingScanTimer = null;
  let lastHref = window.location.href;

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

  function scheduleEvidence(trigger, delayMs = MUTATION_DEBOUNCE_MS) {
    window.clearTimeout(pendingScanTimer);
    pendingScanTimer = window.setTimeout(() => {
      pendingScanTimer = null;
      sendEvidence(trigger);
      observeAccessibleIframeDocuments();
    }, delayMs);
  }

  function observeDocument(ownerDocument) {
    if (!ownerDocument?.documentElement || observedDocuments.has(ownerDocument)) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (mutations.some(isCredentialRelevantMutation)) {
        scheduleEvidence("formguard_mutation");
      }
    });

    observer.observe(ownerDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTE_FILTER,
    });
    observers.push(observer);

    ownerDocument.addEventListener("focusin", handleUserInteraction, true);
    ownerDocument.addEventListener("click", handleUserInteraction, true);
    ownerDocument.addEventListener("submit", () => scheduleEvidence("formguard_submit", 0), true);
    observedDocuments.add(ownerDocument);
  }

  function isCredentialRelevantMutation(mutation) {
    if (mutation.type === "attributes") {
      return isCredentialRelevantNode(mutation.target);
    }

    return Array.from(mutation.addedNodes).some(isCredentialRelevantNode);
  }

  function isCredentialRelevantNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return node.matches?.(CREDENTIAL_SELECTOR) || Boolean(node.querySelector?.(CREDENTIAL_SELECTOR));
  }

  function handleUserInteraction(event) {
    if (!isCredentialRelevantNode(event.target)) {
      return;
    }

    scheduleEvidence("formguard_interaction", INTERACTION_DEBOUNCE_MS);
  }

  function observeAccessibleIframeDocuments() {
    const iframes = Array.from(document.querySelectorAll("iframe"));

    for (const iframe of iframes) {
      if (!iframeLoadListeners.has(iframe)) {
        iframe.addEventListener("load", () => {
          observeIframeDocument(iframe);
          scheduleEvidence("formguard_iframe_load");
        });
        iframeLoadListeners.add(iframe);
      }

      observeIframeDocument(iframe);
    }
  }

  function observeIframeDocument(iframe) {
    try {
      if (iframe.contentDocument) {
        observeDocument(iframe.contentDocument);
      }
    } catch {
      // Cross-origin iframes are counted by the scanner, but their DOM cannot be inspected.
    }
  }

  function checkLocationChange() {
    if (window.location.href === lastHref) {
      return;
    }

    lastHref = window.location.href;
    scheduleEvidence("location_change", 0);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.REQUEST_PAGE_SCAN) {
      return false;
    }

    sendEvidence("requested");
    sendResponse({ ok: true });
    return false;
  });

  observeDocument(document);
  observeAccessibleIframeDocuments();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => sendEvidence("dom_content_loaded"), { once: true });
  } else {
    sendEvidence("document_idle");
  }

  window.addEventListener("pageshow", () => sendEvidence("pageshow"), { once: true });
  window.addEventListener("popstate", () => scheduleEvidence("location_change", 0));
  window.addEventListener("hashchange", () => scheduleEvidence("location_change", 0));
  window.setInterval(checkLocationChange, LOCATION_POLL_MS);
})();
