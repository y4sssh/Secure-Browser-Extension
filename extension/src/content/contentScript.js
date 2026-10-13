import { scanPage } from "./pageScanner";
import { initPasswordAnalyzer } from "./passwordAnalyzer";

(() => {
  const MESSAGE_TYPES = {
    PAGE_EVIDENCE_COLLECTED: "secureBrowser.pageEvidenceCollected",
    REQUEST_PAGE_SCAN: "secureBrowser.requestPageScan",
    RISK_LOCKDOWN: "secureBrowser.riskLockdownShow",
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
  let previousDocumentOverflow = "";
  let riskLockdownActive = false;
  let riskLockdownGuard = null;
  let riskLockdownObserver = null;

  function getIgnoredRiskSites() {
    try {
      const raw = localStorage.getItem("secureBrowser.ignoredRiskSites");
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function isIgnoredRiskSite(hostname) {
    const target = String(hostname || "").toLowerCase();
    if (!target) {
      return false;
    }
    return getIgnoredRiskSites().some((site) => String(site || "").toLowerCase() === target);
  }

  function rememberIgnoredRiskSite(hostname) {
    const target = String(hostname || "").toLowerCase();
    if (!target) {
      return;
    }

    const nextItems = Array.from(new Set([...getIgnoredRiskSites(), target]));
    try {
      localStorage.setItem("secureBrowser.ignoredRiskSites", JSON.stringify(nextItems));
    } catch {
      // Ignore storage failures while still hiding the overlay for the current page.
    }
  }

  function installRiskLockdownGuard() {
    if (riskLockdownGuard) {
      return;
    }

    const suppressEvent = (event) => {
      if (event.target && event.target.closest && event.target.closest("#secure-browser-risk-lockdown, #secure-browser-risk-toast, #secure-browser-risk-topbar")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "keydown") {
        event.stopImmediatePropagation();
      }
    };

    riskLockdownGuard = {
      suppressEvent,
      handleKeydown: (event) => {
        if (event.key === "Tab" || event.key === "Escape" || event.key === "F5") {
          event.preventDefault();
        }
        suppressEvent(event);
      },
    };

    document.addEventListener("mousedown", suppressEvent, true);
    document.addEventListener("mouseup", suppressEvent, true);
    document.addEventListener("click", suppressEvent, true);
    document.addEventListener("keydown", riskLockdownGuard.handleKeydown, true);
    document.addEventListener("touchstart", suppressEvent, true);
    document.addEventListener("touchmove", suppressEvent, { passive: false, capture: true });
    document.addEventListener("wheel", suppressEvent, { passive: false, capture: true });
    document.addEventListener("scroll", suppressEvent, { passive: false, capture: true });
  }

  function removeRiskLockdownGuard() {
    if (!riskLockdownGuard) {
      return;
    }

    document.removeEventListener("mousedown", riskLockdownGuard.suppressEvent, true);
    document.removeEventListener("mouseup", riskLockdownGuard.suppressEvent, true);
    document.removeEventListener("click", riskLockdownGuard.suppressEvent, true);
    document.removeEventListener("keydown", riskLockdownGuard.handleKeydown, true);
    document.removeEventListener("touchstart", riskLockdownGuard.suppressEvent, true);
    document.removeEventListener("touchmove", riskLockdownGuard.suppressEvent, { passive: false, capture: true });
    document.removeEventListener("wheel", riskLockdownGuard.suppressEvent, { passive: false, capture: true });
    document.removeEventListener("scroll", riskLockdownGuard.suppressEvent, { passive: false, capture: true });
    riskLockdownGuard = null;
  }

  function startRiskLockdownPersistence() {
    if (riskLockdownObserver) {
      return;
    }

    riskLockdownObserver = new MutationObserver(() => {
      if (!riskLockdownActive) {
        return;
      }

      if (currentRiskOverlay && currentRiskOverlay.isConnected) {
        return;
      }

      const rootNode = document.documentElement || document.body;
      if (rootNode && currentRiskOverlay) {
        rootNode.appendChild(currentRiskOverlay);
      }
    });

    const targetNode = document.documentElement || document.body;
    if (targetNode) {
      riskLockdownObserver.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
  }

  function stopRiskLockdownPersistence() {
    if (riskLockdownObserver) {
      riskLockdownObserver.disconnect();
      riskLockdownObserver = null;
    }
  }

  function renderRiskLockdown(payload = {}, hostname) {
    if (currentRiskOverlay && currentRiskOverlay.isConnected) {
      installRiskLockdownGuard();
      return;
    }

    riskLockdownActive = true;
    installRiskLockdownGuard();

    const reasons = Array.isArray(payload.reasons) && payload.reasons.length > 0
      ? payload.reasons.slice(0, 4)
      : ["This page shows signs of phishing, fake login behavior, or credential theft risk."];

    const topWarningBar = document.createElement("div");
    topWarningBar.id = "secure-browser-risk-topbar";
    topWarningBar.style.position = "fixed";
    topWarningBar.style.top = "0";
    topWarningBar.style.left = "0";
    topWarningBar.style.right = "0";
    topWarningBar.style.zIndex = "2147483647";
    topWarningBar.style.height = "56px";
    topWarningBar.style.background = "linear-gradient(90deg, rgba(127, 29, 29, 0.98), rgba(69, 10, 10, 0.98))";
    topWarningBar.style.borderBottom = "1px solid rgba(254, 202, 202, 0.5)";
    topWarningBar.style.boxShadow = "0 10px 24px rgba(2, 6, 23, 0.26)";
    topWarningBar.style.display = "flex";
    topWarningBar.style.alignItems = "center";
    topWarningBar.style.justifyContent = "center";
    topWarningBar.style.padding = "0 16px";
    topWarningBar.style.color = "#fff7ed";
    topWarningBar.style.fontFamily = "system-ui, sans-serif";
    topWarningBar.style.fontSize = "13px";
    topWarningBar.style.fontWeight = "800";
    topWarningBar.style.letterSpacing = "0.04em";
    topWarningBar.style.textTransform = "uppercase";
    topWarningBar.textContent = "Secure Browser blocked this page";
    document.documentElement.appendChild(topWarningBar);

    const toast = document.createElement("div");
    toast.id = "secure-browser-risk-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.style.position = "fixed";
    toast.style.top = "18px";
    toast.style.right = "18px";
    toast.style.width = "min(360px, calc(100vw - 28px))";
    toast.style.zIndex = "2147483648";
    toast.style.background = "linear-gradient(180deg, rgba(127, 29, 29, 0.98), rgba(69, 10, 10, 0.98))";
    toast.style.border = "1px solid rgba(254, 202, 202, 0.65)";
    toast.style.borderRadius = "14px";
    toast.style.boxShadow = "0 18px 42px rgba(2, 6, 23, 0.56)";
    toast.style.padding = "12px 14px";
    toast.style.color = "#fff7ed";
    toast.style.fontFamily = "system-ui, sans-serif";
    toast.style.pointerEvents = "auto";
    toast.style.backdropFilter = "blur(8px)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "opacity 180ms ease, transform 180ms ease";
    toast.style.animation = "secureBrowserToastIn 180ms ease forwards";

    const toastTitle = document.createElement("div");
    toastTitle.textContent = "Secure Browser blocked this page";
    toastTitle.style.fontWeight = "800";
    toastTitle.style.marginBottom = "4px";
    toastTitle.style.fontSize = "13px";
    toastTitle.style.letterSpacing = "0.04em";
    toastTitle.style.textTransform = "uppercase";

    const toastBody = document.createElement("div");
    toastBody.textContent = "This page looks unsafe. Close the tab or reload only after confirming the destination.";
    toastBody.style.lineHeight = "1.5";
    toastBody.style.fontSize = "13px";
    toastBody.style.color = "#fee2e2";

    toast.append(toastTitle, toastBody);
    document.documentElement.appendChild(toast);

    const dismissToast = () => {
      toast.style.animation = "secureBrowserToastOut 180ms ease forwards";
      window.setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 180);
    };

    window.setTimeout(dismissToast, 8000);

    const styleTag = document.createElement("style");
    styleTag.setAttribute("data-secure-browser-risk", "true");
    styleTag.textContent = `
      @keyframes secureBrowserToastIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes secureBrowserToastOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.documentElement.appendChild(styleTag);

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
    panel.style.position = "fixed";
    panel.style.top = "18px";
    panel.style.right = "18px";
    panel.style.width = "min(420px, calc(100vw - 32px))";
    panel.style.maxWidth = "420px";
    panel.style.background = "linear-gradient(180deg, rgba(127, 29, 29, 0.96), rgba(69, 10, 10, 0.96))";
    panel.style.border = "1px solid rgba(254, 202, 202, 0.6)";
    panel.style.borderRadius = "18px";
    panel.style.boxShadow = "0 24px 80px rgba(2, 6, 23, 0.72)";
    panel.style.padding = "18px 18px 16px";
    panel.style.color = "#fff7ed";
    panel.style.zIndex = "2147483648";
    panel.style.backdropFilter = "blur(10px)";
    panel.style.cursor = "default";

    const badge = document.createElement("div");
    badge.textContent = "Secure Browser blocked this page";
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.padding = "7px 10px";
    badge.style.marginBottom = "12px";
    badge.style.borderRadius = "999px";
    badge.style.background = "rgba(15, 23, 42, 0.44)";
    badge.style.border = "1px solid rgba(254, 202, 202, 0.45)";
    badge.style.color = "#fee2e2";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "11px";
    badge.style.letterSpacing = "0.06em";
    badge.style.textTransform = "uppercase";

    const title = document.createElement("h2");
    title.textContent = "This page is unsafe to continue";
    title.style.margin = "0 0 10px";
    title.style.fontSize = "24px";
    title.style.lineHeight = "1.2";

    const description = document.createElement("p");
    description.textContent = "Secure Browser detected a likely phishing, fake login, or credential theft pattern on ";
    const hostSpan = document.createElement("strong");
    hostSpan.textContent = hostname;
    description.appendChild(hostSpan);
    description.style.margin = "0 0 12px";
    description.style.color = "#fff0f0";
    description.style.lineHeight = "1.5";
    description.style.fontSize = "14px";

    const reasonsList = document.createElement("ul");
    reasonsList.style.margin = "0 0 14px";
    reasonsList.style.paddingLeft = "18px";
    reasonsList.style.color = "#fee2e2";
    reasonsList.style.lineHeight = "1.5";
    reasons.forEach((reason) => {
      const item = document.createElement("li");
      item.textContent = String(reason).slice(0, 180);
      reasonsList.appendChild(item);
    });

    const recommendation = document.createElement("div");
    recommendation.style.margin = "0 0 14px";
    recommendation.style.padding = "10px 12px";
    recommendation.style.borderRadius = "10px";
    recommendation.style.background = "rgba(15, 23, 42, 0.42)";
    recommendation.style.border = "1px solid rgba(254, 202, 202, 0.38)";
    const recommendationLabel = document.createElement("strong");
    recommendationLabel.textContent = "Recommended action";
    const recommendationText = document.createElement("p");
    recommendationText.textContent = "Close this tab or reload the page before entering credentials, payment details, or multi-factor codes.";
    recommendationText.style.margin = "6px 0 0";
    recommendationText.style.color = "#fff0f0";
    recommendationText.style.lineHeight = "1.5";
    recommendation.append(recommendationLabel, recommendationText);

    const reloadConfirm = document.createElement("div");
    reloadConfirm.style.display = "none";
    reloadConfirm.style.margin = "0 0 14px";
    reloadConfirm.style.padding = "10px 12px";
    reloadConfirm.style.borderRadius = "10px";
    reloadConfirm.style.background = "rgba(15, 23, 42, 0.7)";
    reloadConfirm.style.border = "1px solid rgba(248, 250, 252, 0.4)";

    const reloadConfirmText = document.createElement("p");
    reloadConfirmText.textContent = "Reloading this page is safe only if you have verified the destination URL. If you are not sure, keep the page blocked.";
    reloadConfirmText.style.margin = "0";
    reloadConfirmText.style.lineHeight = "1.5";
    reloadConfirmText.style.color = "#f8fafc";

    const reloadConfirmActions = document.createElement("div");
    reloadConfirmActions.style.display = "flex";
    reloadConfirmActions.style.gap = "10px";
    reloadConfirmActions.style.marginTop = "10px";
    reloadConfirmActions.style.flexWrap = "wrap";

    const confirmReloadButton = document.createElement("button");
    confirmReloadButton.type = "button";
    confirmReloadButton.textContent = "Yes, reload";
    confirmReloadButton.style.flex = "1 1 140px";
    confirmReloadButton.style.padding = "10px 12px";
    confirmReloadButton.style.borderRadius = "10px";
    confirmReloadButton.style.border = "1px solid rgba(34, 197, 94, 0.5)";
    confirmReloadButton.style.background = "#14532d";
    confirmReloadButton.style.color = "#ecfdf5";
    confirmReloadButton.style.fontWeight = "700";
    confirmReloadButton.style.cursor = "pointer";
    confirmReloadButton.addEventListener("click", () => {
      try {
        window.location.reload();
      } catch {
        chrome.runtime.sendMessage(
          { type: MESSAGE_TYPES.RISK_LOCKDOWN_ACTION, action: "reload", tabId: payload.tabId },
          () => void chrome.runtime.lastError,
        );
      }
    });

    const keepBlockedButton = document.createElement("button");
    keepBlockedButton.type = "button";
    keepBlockedButton.textContent = "Keep blocked";
    keepBlockedButton.style.flex = "1 1 140px";
    keepBlockedButton.style.padding = "10px 12px";
    keepBlockedButton.style.borderRadius = "10px";
    keepBlockedButton.style.border = "1px solid rgba(148, 163, 184, 0.5)";
    keepBlockedButton.style.background = "#0f172a";
    keepBlockedButton.style.color = "#e2e8f0";
    keepBlockedButton.style.fontWeight = "600";
    keepBlockedButton.style.cursor = "pointer";
    keepBlockedButton.addEventListener("click", () => {
      reloadConfirm.style.display = "none";
    });

    reloadConfirmActions.append(confirmReloadButton, keepBlockedButton);
    reloadConfirm.append(reloadConfirmText, reloadConfirmActions);

    const strictNotice = document.createElement("div");
    strictNotice.style.margin = "0 0 16px";
    strictNotice.style.padding = "10px 12px";
    strictNotice.style.borderRadius = "10px";
    strictNotice.style.background = "rgba(15, 23, 42, 0.42)";
    strictNotice.style.border = "1px solid rgba(254, 202, 202, 0.38)";
    strictNotice.style.color = "#fef2f2";
    strictNotice.style.fontWeight = "600";
    strictNotice.style.lineHeight = "1.5";
    strictNotice.textContent = "This page must close this tab or reload the page before you can continue. Direct access is blocked for your protection.";

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "10px";
    actionRow.style.flexWrap = "wrap";
    actionRow.style.marginTop = "8px";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close tab";
    closeButton.style.flex = "1 1 150px";
    closeButton.style.padding = "12px 14px";
    closeButton.style.borderRadius = "10px";
    closeButton.style.border = "1px solid rgba(254, 202, 202, 0.45)";
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

    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = "Reload page";
    reloadButton.style.flex = "1 1 150px";
    reloadButton.style.padding = "12px 14px";
    reloadButton.style.borderRadius = "10px";
    reloadButton.style.border = "1px solid rgba(248, 250, 252, 0.5)";
    reloadButton.style.background = "rgba(15, 23, 42, 0.72)";
    reloadButton.style.color = "#f8fafc";
    reloadButton.style.fontWeight = "700";
    reloadButton.style.cursor = "pointer";
    reloadButton.addEventListener("click", () => {
      reloadConfirm.style.display = "block";
    });

    const ignoreButton = document.createElement("button");
    ignoreButton.type = "button";
    ignoreButton.textContent = "Ignore for this site";
    ignoreButton.style.flex = "1 1 100%";
    ignoreButton.style.padding = "10px 12px";
    ignoreButton.style.borderRadius = "10px";
    ignoreButton.style.border = "1px solid rgba(148, 163, 184, 0.55)";
    ignoreButton.style.background = "rgba(15, 23, 42, 0.5)";
    ignoreButton.style.color = "#e2e8f0";
    ignoreButton.style.fontWeight = "600";
    ignoreButton.style.cursor = "pointer";
    ignoreButton.addEventListener("click", () => {
      rememberIgnoredRiskSite(hostname);
      hideRiskLockdown();
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.RISK_LOCKDOWN_ACTION, action: "ignore_site", tabId: payload.tabId },
        () => void chrome.runtime.lastError,
      );
    });

    const footer = document.createElement("p");
    footer.textContent = "This is a protection warning from Secure Browser. You must close this tab or reload the page before continuing.";
    footer.style.margin = "10px 0 0";
    footer.style.color = "#ffe4e6";
    footer.style.fontSize = "12px";
    footer.style.lineHeight = "1.5";

    actionRow.append(closeButton, reloadButton, ignoreButton);
    panel.append(badge, title, description, reasonsList, recommendation, reloadConfirm, strictNotice, actionRow, footer);
    overlay.appendChild(panel);

    const rootNode = document.body || document.documentElement;
    if (rootNode) {
      previousBodyPointerEvents = rootNode.style.pointerEvents || "";
      rootNode.style.pointerEvents = "";
      rootNode.style.userSelect = "none";
      rootNode.setAttribute("aria-hidden", "true");
    }

    previousDocumentOverflow = document.documentElement.style.overflow || "";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.filter = "saturate(0.65) brightness(0.85)";
    overlay.style.pointerEvents = "auto";
    document.documentElement.appendChild(overlay);
    currentRiskOverlay = overlay;
    startRiskLockdownPersistence();
  }

  function showRiskLockdown(payload = {}) {
    if (typeof sessionStorage !== "undefined") {
      const sessionOverride = sessionStorage.getItem("secureBrowser.riskLockdownAllowed");
      if (sessionOverride === "true") {
        return;
      }
    }

    if (riskLockdownActive && currentRiskOverlay && currentRiskOverlay.isConnected) {
      installRiskLockdownGuard();
      return;
    }

    const hostname = payload.hostname || window.location.hostname || "this page";
    if (isIgnoredRiskSite(hostname)) {
      return;
    }

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      try {
        chrome.storage.local.get({ secureBrowser: { consents: {} } }, (items) => {
          const settings = items?.secureBrowser?.consents || items?.["secureBrowser.consents"] || {};
          const enabled = settings.riskLockdownEnabled ?? items?.secureBrowser?.riskLockdownEnabled ?? true;
          if (enabled) {
            renderRiskLockdown(payload, hostname);
          }
        });
      } catch {
        renderRiskLockdown(payload, hostname);
      }
      return;
    }

    renderRiskLockdown(payload, hostname);
  }

  function hideRiskLockdown() {
    if (currentRiskOverlay && currentRiskOverlay.parentNode) {
      currentRiskOverlay.parentNode.removeChild(currentRiskOverlay);
    }

    if (document.body) {
      document.body.style.pointerEvents = previousBodyPointerEvents;
      document.body.style.userSelect = "";
    }

    document.documentElement.style.pointerEvents = "";
    document.documentElement.style.overflow = previousDocumentOverflow;
    document.documentElement.style.filter = "";
    riskLockdownActive = false;
    removeRiskLockdownGuard();
    stopRiskLockdownPersistence();

    if (document.body) {
      document.body.removeAttribute("aria-hidden");
    }

    const toastEl = document.getElementById("secure-browser-risk-toast");
    if (toastEl && toastEl.parentNode) {
      toastEl.parentNode.removeChild(toastEl);
    }

    const topBarEl = document.getElementById("secure-browser-risk-topbar");
    if (topBarEl && topBarEl.parentNode) {
      topBarEl.parentNode.removeChild(topBarEl);
    }

    const inlineStyle = document.querySelector("style[data-secure-browser-risk]");
    if (inlineStyle && inlineStyle.parentNode) {
      inlineStyle.parentNode.removeChild(inlineStyle);
    }

    currentRiskOverlay = null;
  }

  // Explainability banner: inject a small persistent banner when a page is flagged
  function renderExplainabilityBanner(data = {}) {
    try {
      // avoid duplicate banners
      if (document.getElementById("secure-browser-explain-banner")) return;

      const banner = document.createElement("div");
      banner.id = "secure-browser-explain-banner";
      banner.style.position = "fixed";
      banner.style.bottom = "18px";
      banner.style.right = "18px";
      banner.style.zIndex = "2147483646";
      banner.style.background = "linear-gradient(90deg,#082032,#0f172a)";
      banner.style.color = "#e6f0ff";
      banner.style.padding = "10px 14px";
      banner.style.borderRadius = "12px";
      banner.style.boxShadow = "0 10px 30px rgba(2,6,23,0.6)";
      banner.style.fontFamily = "system-ui, sans-serif";
      banner.style.fontSize = "13px";
      banner.style.display = "flex";
      banner.style.alignItems = "center";
      banner.style.gap = "10px";

      const message = document.createElement("div");
      message.textContent = data.title || "Secure Browser: page flagged";

      const why = document.createElement("button");
      why.type = "button";
      why.textContent = "Why?";
      why.style.background = "transparent";
      why.style.color = "#bfdbfe";
      why.style.border = "1px solid rgba(147,197,253,0.12)";
      why.style.padding = "6px 10px";
      why.style.borderRadius = "8px";
      why.style.cursor = "pointer";
      why.addEventListener("click", () => {
        // deep-link to popup by opening the extension popup page in a new tab
        // fallback: open dashboard.html shipped with extension
        const dashboardUrl = chrome.runtime.getURL("dashboard.html");
        window.open(dashboardUrl + "#explain?tabId=" + (data.tabId || ""), "_blank", "noopener");
      });

      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "Dismiss";
      dismiss.style.background = "transparent";
      dismiss.style.color = "#94a3b8";
      dismiss.style.border = "none";
      dismiss.style.padding = "6px 10px";
      dismiss.style.borderRadius = "8px";
      dismiss.style.cursor = "pointer";
      dismiss.addEventListener("click", () => {
        const el = document.getElementById("secure-browser-explain-banner");
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });

      banner.append(message, why, dismiss);
      (document.body || document.documentElement).appendChild(banner);
    } catch (e) {
      // ignore DOM failures
    }
  }

  // Expose a helper for other parts to show the explainability banner
  window.__secureBrowserShowExplain = (data) => renderExplainabilityBanner(data);

  // Inject a page-level script to intercept fetch and XHR for monitoring/blocking
  function injectNetworkInterceptor() {
    try {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.textContent = `(() => {
        const BLOCK_KEY = 'secureBrowser_block_rules';
        // Simple heuristic: block requests to suspicious paths containing keywords
        const suspiciousKeywords = ['login', 'auth', 'steal', 'collect', 'token', 'verify', 'credential'];

        function isSuspicious(url) {
          try {
            const u = new URL(url, location.href);
            const p = (u.pathname + ' ' + u.search).toLowerCase();
            return suspiciousKeywords.some(k => p.includes(k));
          } catch { return false; }
        }

        // POST a message to page context consumers to notify of blocked attempts
        function notifyBlocked(info) {
          window.postMessage({ source: 'secureBrowser', type: 'networkBlocked', payload: info }, '*');
        }

        // Wrap fetch
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
          try {
            const url = (typeof input === 'string') ? input : (input && input.url) || '';
            const method = (init && init.method) || (input && input.method) || 'GET';
            if (isSuspicious(url)) {
              const info = { url, method, reason: 'suspicious path keyword' };
              notifyBlocked(info);
              // return a failed promise to emulate network block
              return Promise.reject(new TypeError('Network request blocked by Secure Browser'));
            }
          } catch (e) {}
          return origFetch.apply(this, arguments);
        };

        // Wrap XHR
        const OrigXHR = window.XMLHttpRequest;
        function WrappedXHR() {
          const xr = new OrigXHR();
          let _url = '';
          let _method = '';
          const origOpen = xr.open;
          xr.open = function(method, url) {
            try { _url = url; _method = method || 'GET'; } catch {}
            return origOpen.apply(this, arguments);
          };
          const origSend = xr.send;
          xr.send = function(body) {
            try {
              if (isSuspicious(_url)) {
                notifyBlocked({ url: _url, method: _method, reason: 'suspicious path keyword' });
                // abort and trigger error
                try { this.abort(); } catch(e) {}
                if (typeof this.onerror === 'function') {
                  try { this.onerror(new Error('Network request blocked by Secure Browser')); } catch(e) {}
                }
                return;
              }
            } catch(e) {}
            return origSend.apply(this, arguments);
          };
          return xr;
        }
        WrappedXHR.prototype = OrigXHR.prototype;
        window.XMLHttpRequest = WrappedXHR;
      })();`;

      (document.head || document.documentElement).appendChild(script);
      script.parentNode.removeChild(script);
    } catch (e) {
      // ignore injection failures
    }
  }

  // Listen for page->content messages about blocked network attempts
  window.addEventListener('message', (ev) => {
    try {
      if (!ev.data || ev.data.source !== 'secureBrowser' || ev.data.type !== 'networkBlocked') return;
      const payload = ev.data.payload || {};
      // forward to background to log
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'secureBrowser.logBlockedRequest', payload }, (resp) => {});
      }
      // show explainability banner to user
      try { window.__secureBrowserShowExplain({ title: 'Network request blocked', tabId: '' }); } catch {}
    } catch (e) {}
  }, false);

  // inject on startup
  injectNetworkInterceptor();

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
