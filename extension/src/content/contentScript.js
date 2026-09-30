import { scanPage } from "./pageScanner";
import { initPasswordAnalyzer } from "./passwordAnalyzer";

(() => {
  const MESSAGE_TYPES = {
    PAGE_EVIDENCE_COLLECTED: "secureBrowser.pageEvidenceCollected",
    REQUEST_PAGE_SCAN: "secureBrowser.requestPageScan",
    RISK_LOCKDOWN_SHOW: "secureBrowser.riskLockdownShow",
    RISK_LOCKDOWN_ACTION: "secureBrowser.riskLockdownAction",
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
  let currentRiskOverlay = null;
  let previousBodyPointerEvents = "";

  function showRiskLockdown(payload = {}) {
    if (typeof sessionStorage !== "undefined") {
      const sessionOverride = sessionStorage.getItem("secureBrowser.riskLockdownAllowed");
      if (sessionOverride === "true") {
        return;
      }
    }

    if (currentRiskOverlay && currentRiskOverlay.isConnected) {
      return;
    }

    const hostname = payload.hostname || window.location.hostname || "this page";
    const reasons = Array.isArray(payload.reasons) && payload.reasons.length > 0
      ? payload.reasons.slice(0, 4)
      : ["This page shows signs of phishing, fake login behavior, or credential theft risk."];

    const overlay = document.createElement("div");
    overlay.id = "secure-browser-risk-lockdown";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-live", "assertive");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.background = "rgba(10, 14, 24, 0.82)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.padding = "24px";
    overlay.style.fontFamily = "system-ui, sans-serif";
    overlay.style.pointerEvents = "auto";

    const panel = document.createElement("div");
    panel.style.background = "#111827";
    panel.style.border = "1px solid rgba(248, 113, 113, 0.5)";
    panel.style.borderRadius = "18px";
    panel.style.maxWidth = "560px";
    panel.style.width = "100%";
    panel.style.boxShadow = "0 28px 80px rgba(0,0,0,0.45)";
    panel.style.padding = "24px 24px 20px";
    panel.style.color = "#eff6ff";

    const title = document.createElement("h2");
    title.textContent = "This page looks risky";
    title.style.margin = "0 0 10px";
    title.style.fontSize = "28px";
    title.style.lineHeight = "1.2";

    const description = document.createElement("p");
    description.textContent = "The extension detected a likely phishing, fake login, or credential theft pattern on ";
    const hostSpan = document.createElement("strong");
    hostSpan.textContent = hostname;
    description.appendChild(hostSpan);
    description.style.margin = "0 0 14px";
    description.style.color = "#dbeafe";
    description.style.lineHeight = "1.5";
    description.style.fontSize = "15px";

    const reasonsList = document.createElement("ul");
    reasonsList.style.margin = "0 0 18px";
    reasonsList.style.paddingLeft = "18px";
    reasonsList.style.color = "#e2e8f0";
    reasonsList.style.lineHeight = "1.5";
    reasons.forEach((reason) => {
      const item = document.createElement("li");
      item.textContent = String(reason).slice(0, 180);
      reasonsList.appendChild(item);
    });

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "12px";
    actionRow.style.flexWrap = "wrap";
    actionRow.style.marginTop = "10px";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close tab";
    closeButton.style.flex = "1 1 160px";
    closeButton.style.padding = "12px 16px";
    closeButton.style.borderRadius = "10px";
    closeButton.style.border = "1px solid rgba(248, 113, 113, 0.5)";
    closeButton.style.background = "#b91c1c";
    closeButton.style.color = "#fff";
    closeButton.style.fontWeight = "700";
    closeButton.style.cursor = "pointer";
    closeButton.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.RISK_LOCKDOWN_ACTION, action: "close", tabId: payload.tabId },
        () => void chrome.runtime.lastError,
      );
    });

    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.textContent = "Continue anyway";
    continueButton.style.flex = "1 1 160px";
    continueButton.style.padding = "12px 16px";
    continueButton.style.borderRadius = "10px";
    continueButton.style.border = "1px solid rgba(96, 165, 250, 0.6)";
    continueButton.style.background = "#0f172a";
    continueButton.style.color = "#e0f2fe";
    continueButton.style.fontWeight = "700";
    continueButton.style.cursor = "pointer";
    continueButton.addEventListener("click", () => {
      try {
        sessionStorage.setItem("secureBrowser.riskLockdownAllowed", "true");
      } catch {
        // Ignore storage failures and still allow the user to continue.
      }
      hideRiskLockdown();
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.RISK_LOCKDOWN_ACTION, action: "continue", tabId: payload.tabId },
        () => void chrome.runtime.lastError,
      );
    });

    const footer = document.createElement("p");
    footer.textContent = "This is a protection overlay. You may choose to continue only if you explicitly trust the page.";
    footer.style.margin = "0";
    footer.style.color = "#cbd5e1";
    footer.style.fontSize = "12px";
    footer.style.lineHeight = "1.5";

    actionRow.append(closeButton, continueButton);
    panel.append(title, description, reasonsList, actionRow, footer);
    overlay.appendChild(panel);

    const rootNode = document.body || document.documentElement;
    if (rootNode) {
      previousBodyPointerEvents = rootNode.style.pointerEvents || "";
      rootNode.style.pointerEvents = "none";
    }

    document.documentElement.appendChild(overlay);
    currentRiskOverlay = overlay;
  }

  function hideRiskLockdown() {
    if (currentRiskOverlay && currentRiskOverlay.parentNode) {
      currentRiskOverlay.parentNode.removeChild(currentRiskOverlay);
    }

    if (document.body) {
      document.body.style.pointerEvents = previousBodyPointerEvents;
    }
    currentRiskOverlay = null;
  }

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
    if (message?.type === MESSAGE_TYPES.REQUEST_PAGE_SCAN) {
      sendEvidence("requested");
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === MESSAGE_TYPES.RISK_LOCKDOWN_SHOW) {
      showRiskLockdown(message.payload || {});
      sendResponse({ ok: true });
      return false;
    }

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

  initPasswordAnalyzer();
})();
