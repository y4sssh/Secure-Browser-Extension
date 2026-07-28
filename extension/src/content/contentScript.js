(() => {
  const MESSAGE_TYPES = {
    PAGE_EVIDENCE_COLLECTED: "secureBrowser.pageEvidenceCollected",
    REQUEST_PAGE_SCAN: "secureBrowser.requestPageScan",
  };

  function collectPageEvidence(trigger = "document_idle") {
    const pageUrl = new URL(window.location.href);
    const forms = Array.from(document.forms);
    const formEvidence = forms.slice(0, 10).map(collectFormEvidence);
    const passwordFieldCount = document.querySelectorAll('input[type="password"]').length;
    const crossOriginFormCount = formEvidence.filter((form) => form.actionIsCrossOrigin).length;
    const insecureSubmitCount = formEvidence.filter((form) => form.actionProtocol === "http:").length;
    const score = calculateInitialTrustScore({
      isHttps: pageUrl.protocol === "https:",
      passwordFieldCount,
      crossOriginFormCount,
      insecureSubmitCount,
    });
    const reasons = collectReasons({
      isHttps: pageUrl.protocol === "https:",
      passwordFieldCount,
      crossOriginFormCount,
      insecureSubmitCount,
    });

    return {
      url: sanitizeUrl(pageUrl),
      origin: pageUrl.origin,
      hostname: pageUrl.hostname,
      timestamp: new Date().toISOString(),
      trigger,
      signals: {
        https: pageUrl.protocol === "https:",
        hasPasswordField: passwordFieldCount > 0,
        formCount: forms.length,
        passwordFieldCount,
        formPostsCrossOrigin: crossOriginFormCount > 0,
        formPostsToHttp: insecureSubmitCount > 0,
        pathLength: pageUrl.pathname.length,
        queryPresent: pageUrl.search.length > 0,
        hashPresent: pageUrl.hash.length > 0,
        iframeDepth: window.top === window ? 0 : 1,
        titleLength: document.title?.length ?? 0,
      },
      forms: formEvidence,
      scores: {
        finalTrustScore: score,
      },
      verdict: getVerdict(score),
      reasons,
    };
  }

  function collectFormEvidence(form) {
    const actionUrl = getActionUrl(form);
    const inputs = Array.from(form.querySelectorAll("input"));
    const passwordFields = inputs.filter((input) => input.type === "password");
    const autocompleteDisabled = form.autocomplete === "off" || inputs.some((input) => input.autocomplete === "off");

    return {
      method: (form.method || "get").toLowerCase(),
      actionProtocol: actionUrl.protocol,
      actionHost: actionUrl.hostname,
      actionIsCrossOrigin: actionUrl.origin !== window.location.origin,
      inputCount: inputs.length,
      passwordFieldCount: passwordFields.length,
      autocompleteDisabled,
    };
  }

  function getActionUrl(form) {
    const action = form.getAttribute("action") || window.location.href;

    try {
      return new URL(action, window.location.href);
    } catch {
      return new URL(window.location.href);
    }
  }

  function calculateInitialTrustScore(signals) {
    let score = 92;

    if (!signals.isHttps) score -= 24;
    if (signals.passwordFieldCount > 0 && !signals.isHttps) score -= 28;
    if (signals.crossOriginFormCount > 0) score -= 26;
    if (signals.insecureSubmitCount > 0) score -= 24;

    return Math.max(0, Math.min(100, score));
  }

  function collectReasons(signals) {
    const reasons = [];

    if (!signals.isHttps) {
      reasons.push("Page is not using HTTPS");
    }

    if (signals.passwordFieldCount > 0 && !signals.isHttps) {
      reasons.push("Password field appears on an insecure page");
    }

    if (signals.crossOriginFormCount > 0) {
      reasons.push("A form submits to a different origin");
    }

    if (signals.insecureSubmitCount > 0) {
      reasons.push("A form submits over HTTP");
    }

    if (reasons.length === 0) {
      reasons.push("No high-risk page or form signals found");
    }

    return reasons;
  }

  function getVerdict(score) {
    if (score >= 80) return "trusted";
    if (score >= 50) return "caution";
    if (score >= 20) return "risky";
    return "high_risk";
  }

  function sanitizeUrl(url) {
    const clone = new URL(url.toString());
    clone.search = "";
    clone.hash = "";
    return clone.toString();
  }

  function sendEvidence(trigger) {
    const payload = collectPageEvidence(trigger);

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
