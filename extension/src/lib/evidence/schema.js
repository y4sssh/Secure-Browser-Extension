export const EVIDENCE_SCHEMA_VERSION = 2;
export const MAX_FORMS_PER_EVIDENCE = 10;
export const MAX_REASONS_PER_EVIDENCE = 8;
export const MAX_REDIRECT_CHAIN = 8;
export const MAX_FORM_GUARD_TIMELINE = 12;
export const MAX_CLAIMED_BRANDS = 4;

export const VERDICTS = {
  TRUSTED: "trusted",
  CAUTION: "caution",
  RISKY: "risky",
  HIGH_RISK: "high_risk",
};

export const ALERT_SEVERITIES = {
  INFO: "info",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

export function normalizeEvidence(payload = {}, sender = {}, context = {}) {
  const timestamp = payload.timestamp ?? new Date().toISOString();
  const url = sanitizeUrl(payload.url ?? sender.tab?.url);
  const scores = normalizeScores(payload.scores);
  const redirect = normalizeRedirectInfo(payload.redirect, context.redirect);
  const formGuard = normalizeFormGuard(payload.formGuard, payload.timeline);
  const signals = {
    ...(payload.signals ?? {}),
    claimedBrands: normalizeStringList(payload.signals?.claimedBrands ?? formGuard.claimedBrands, MAX_CLAIMED_BRANDS),
    redirectCount: redirect.count,
  };
  const finalTrustScore = clampTrustScore(scores.finalTrustScore);
  const verdict = payload.verdict ?? getVerdict(finalTrustScore);

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    id: payload.id ?? `${sender.tab?.id ?? "page"}:${Date.now()}`,
    tabId: sender.tab?.id ?? payload.tabId ?? null,
    windowId: sender.tab?.windowId ?? payload.windowId ?? null,
    url,
    origin: payload.origin ?? getOrigin(url),
    hostname: payload.hostname ?? getHostname(url),
    timestamp,
    trigger: payload.trigger ?? "content_script",
    redirect,
    signals,
    forms: normalizeForms(payload.forms),
    formGuard,
    timeline: formGuard.timeline,
    scores: {
      ...scores,
      finalTrustScore,
    },
    verdict,
    severity: payload.severity ?? getAlertSeverity(finalTrustScore),
    reasons: normalizeReasons(payload.reasons),
  };
}

export function sanitizeUrl(value) {
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

export function getOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function getHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function getVerdict(score) {
  const normalizedScore = clampTrustScore(score);
  if (normalizedScore >= 80) return VERDICTS.TRUSTED;
  if (normalizedScore >= 50) return VERDICTS.CAUTION;
  if (normalizedScore >= 20) return VERDICTS.RISKY;
  return VERDICTS.HIGH_RISK;
}

export function getAlertSeverity(score) {
  const normalizedScore = clampTrustScore(score);
  if (normalizedScore >= 80) return ALERT_SEVERITIES.LOW;
  if (normalizedScore >= 50) return ALERT_SEVERITIES.MEDIUM;
  if (normalizedScore >= 20) return ALERT_SEVERITIES.HIGH;
  return ALERT_SEVERITIES.CRITICAL;
}

export function clampTrustScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampRiskScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeScores(scores = {}) {
  return {
    urlRisk: clampRiskScore(scores.urlRisk),
    formRisk: clampRiskScore(scores.formRisk),
    brandRisk: clampRiskScore(scores.brandRisk),
    downloadRisk: clampRiskScore(scores.downloadRisk),
    extensionExposureRisk: clampRiskScore(scores.extensionExposureRisk),
    finalTrustScore: clampTrustScore(scores.finalTrustScore),
  };
}

function normalizeForms(forms) {
  if (!Array.isArray(forms)) return [];
  return forms.slice(0, MAX_FORMS_PER_EVIDENCE).map((form) => ({
    id: sanitizeShortText(form.id, 48),
    method: form.method ?? "get",
    pageProtocol: form.pageProtocol ?? "",
    pageRegistrableDomain: sanitizeShortText(form.pageRegistrableDomain, 80),
    topPageRegistrableDomain: sanitizeShortText(form.topPageRegistrableDomain, 80),
    actionProtocol: form.actionProtocol ?? "",
    actionHost: sanitizeShortText(form.actionHost, 120),
    actionOrigin: sanitizeShortText(form.actionOrigin, 160),
    actionRegistrableDomain: sanitizeShortText(form.actionRegistrableDomain, 80),
    actionIsCrossOrigin: Boolean(form.actionIsCrossOrigin),
    actionIsCrossDomain: Boolean(form.actionIsCrossDomain),
    actionIsCrossTopLevelDomain: Boolean(form.actionIsCrossTopLevelDomain),
    hasExplicitAction: Boolean(form.hasExplicitAction),
    invalidAction: Boolean(form.invalidAction),
    submitButtonActionCount: safeCount(form.submitButtonActionCount),
    submitButtonCrossDomainActionCount: safeCount(form.submitButtonCrossDomainActionCount),
    submitButtonInsecureActionCount: safeCount(form.submitButtonInsecureActionCount),
    inputCount: safeCount(form.inputCount),
    visibleInputCount: safeCount(form.visibleInputCount),
    passwordFieldCount: safeCount(form.passwordFieldCount),
    readonlyPasswordFieldCount: safeCount(form.readonlyPasswordFieldCount),
    hiddenInputCount: safeCount(form.hiddenInputCount),
    hiddenPasswordFieldCount: safeCount(form.hiddenPasswordFieldCount),
    hiddenCredentialFieldCount: safeCount(form.hiddenCredentialFieldCount),
    emailFieldCount: safeCount(form.emailFieldCount),
    userLikeFieldCount: safeCount(form.userLikeFieldCount),
    autocompleteDisabled: Boolean(form.autocompleteDisabled),
    antiAnalysisSignalCount: safeCount(form.antiAnalysisSignalCount),
    pasteBlocked: Boolean(form.pasteBlocked),
    labelHasLoginText: Boolean(form.labelHasLoginText),
    loginTextSignalCount: safeCount(form.loginTextSignalCount),
    hasLoginText: Boolean(form.hasLoginText),
    claimedBrands: normalizeStringList(form.claimedBrands, MAX_CLAIMED_BRANDS),
    brandDomainMismatch: Boolean(form.brandDomainMismatch),
    loginOverlay: Boolean(form.loginOverlay),
    insideIframe: Boolean(form.insideIframe),
    iframeDepth: safeCount(form.iframeDepth),
  }));
}

function normalizeFormGuard(formGuard = {}, timelinePayload = []) {
  const safeFormGuard = formGuard ?? {};

  return {
    pageHasLoginText: Boolean(safeFormGuard.pageHasLoginText),
    loginTextSignalCount: safeCount(safeFormGuard.loginTextSignalCount),
    claimedBrands: normalizeStringList(safeFormGuard.claimedBrands, MAX_CLAIMED_BRANDS),
    timeline: normalizeTimeline(safeFormGuard.timeline ?? timelinePayload),
  };
}

function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) return [];

  return timeline.slice(-MAX_FORM_GUARD_TIMELINE).map((entry) => ({
    event: sanitizeShortText(entry.event, 64),
    trigger: sanitizeShortText(entry.trigger, 64),
    elapsedMs: safeCount(entry.elapsedMs),
    formCount: safeCount(entry.formCount),
    loginFormCount: safeCount(entry.loginFormCount),
    passwordFieldCount: safeCount(entry.passwordFieldCount),
    crossDomainPasswordFormCount: safeCount(entry.crossDomainPasswordFormCount),
    insecurePasswordSubmitCount: safeCount(entry.insecurePasswordSubmitCount),
  }));
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason) => typeof reason === "string" && reason.trim().length > 0)
    .map((reason) => reason.trim())
    .slice(0, MAX_REASONS_PER_EVIDENCE);
}

function normalizeRedirectInfo(payloadRedirect = {}, trackedRedirect = {}) {
  const payloadCount = safeCount(payloadRedirect.count);
  const trackedCount = safeCount(trackedRedirect.count);
  const chain = Array.isArray(trackedRedirect.chain)
    ? trackedRedirect.chain
    : Array.isArray(payloadRedirect.chain)
      ? payloadRedirect.chain
      : [];

  return {
    count: Math.max(payloadCount, trackedCount),
    chain: chain.map(sanitizeUrl).filter(Boolean).slice(-MAX_REDIRECT_CHAIN),
  };
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeStringList(values, limit) {
  if (!Array.isArray(values)) return [];

  return values
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => sanitizeShortText(value, 80))
    .filter((value, index, allValues) => allValues.indexOf(value) === index)
    .slice(0, limit);
}

function sanitizeShortText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
