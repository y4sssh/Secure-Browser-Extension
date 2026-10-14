export function scoreBehavioralSignals({
  hostname = "",
  forms = [],
  timeline = [],
  redirectCount = 0,
  brandRisk = 0,
} = {}) {
  const safeForms = Array.isArray(forms) ? forms : [];
  const reasons = [];
  let risk = 0;

  const add = (weight, message) => {
    risk += weight;
    reasons.push({ source: "behavior", weight, message });
  };

  const hiddenPasswordFields = safeForms.reduce(
    (total, form) => total + safeCount(form?.hiddenPasswordFieldCount),
    0,
  );
  const hiddenCredentialFields = safeForms.reduce(
    (total, form) => total + safeCount(form?.hiddenCredentialFieldCount),
    0,
  );
  const antiAnalysisSignals = safeForms.reduce(
    (total, form) => total + safeCount(form?.antiAnalysisSignalCount),
    0,
  );
  const crossOriginForms = safeForms.reduce(
    (total, form) => total + (form?.actionIsCrossOrigin ? 1 : 0),
    0,
  );
  const actionChanges = countTimelineEvent(timeline, "form_action_changed");
  const delayedLoginForms =
    countTimelineEvent(timeline, "delayed_password_field") +
    countTimelineEvent(timeline, "delayed_login_form");
  const overlayForms = safeForms.filter((form) => Boolean(form?.loginOverlay)).length;

  if (redirectCount >= 2) {
    add(0.16, "Repeated redirects suggest a deceptive credential flow");
  }

  if (actionChanges > 0) {
    add(0.18, "Form action changed after page load, which is a common phishing tactic");
  }

  if (delayedLoginForms > 0) {
    add(0.14, "Login fields appeared after the page became active, indicating a delayed injection");
  }

  if (hiddenPasswordFields > 0 || hiddenCredentialFields > 0) {
    add(0.12, "Hidden password or credential fields were detected near the login flow");
  }

  if (antiAnalysisSignals > 0) {
    add(0.12, "The page uses anti-analysis behaviors to hide credential harvesting intent");
  }

  if (crossOriginForms > 0) {
    add(0.1, "Credential-looking forms submit to a different origin than the current page");
  }

  if (overlayForms > 0) {
    add(0.1, "A credential overlay or fake login pane was detected");
  }

  if (brandRisk > 0.7 && safeForms.length > 0) {
    add(0.1, "Brand mismatch combined with interactive login behavior increased the risk profile");
  }

  if (!hostname && safeForms.length > 0) {
    add(0.03, "Behavioral suspicion was recorded even without a fully trusted hostname context");
  }

  return {
    risk: clampRisk(risk),
    features: {
      hiddenPasswordFieldCount: hiddenPasswordFields,
      hiddenCredentialFieldCount: hiddenCredentialFields,
      antiAnalysisSignalCount: antiAnalysisSignals,
      crossOriginFormCount: crossOriginForms,
      delayedLoginFormCount: delayedLoginForms,
      actionChangedCount: actionChanges,
      redirectCount,
      overlayFormCount: overlayForms,
    },
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

export function scoreThreatIntelSignals({
  hostname = "",
  brandDomainMismatch = false,
  redirectCount = 0,
  pageRisk = 0,
} = {}) {
  const host = String(hostname ?? "").toLowerCase().trim();
  const reasons = [];
  let risk = 0;

  const add = (weight, message) => {
    risk += weight;
    reasons.push({ source: "threat-intel", weight, message });
  };

  if (!host) {
    add(0.05, "Hostname is unavailable, which weakens domain reputation confidence");
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    add(0.22, "Host is an IP address instead of a normal brand domain");
  }

  if (/(login|signin|verify|secure|account|confirm|update|wallet|help)/i.test(host)) {
    add(0.12, "Hostname pattern resembles an impersonation or credential-harvesting page");
  }

  if (brandDomainMismatch) {
    add(0.18, "The page’s brand identity does not match the actual domain reputation");
  }

  if (redirectCount >= 2) {
    add(0.08, "Multiple redirects are often used to hide the real destination in phishing campaigns");
  }

  if (pageRisk >= 0.7) {
    add(0.1, "The site’s broader risk profile is elevated enough to trigger threat-intel escalation");
  }

  return {
    risk: clampRisk(risk),
    features: {
      hostname: host,
      ipAddressHost: /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host),
      brandDomainMismatch,
      redirectCount,
    },
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

function countTimelineEvent(timeline, eventName) {
  return Array.isArray(timeline)
    ? timeline.filter((entry) => entry && String(entry.event ?? entry.type ?? "") === eventName).length
    : 0;
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
