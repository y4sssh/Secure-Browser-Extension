const SAFE_SIGNAL_KEYS = [
  "https",
  "hasPasswordField",
  "formPostsCrossOrigin",
  "formPostsCrossDomain",
  "formPostsToHttp",
  "insecurePasswordSubmit",
  "hiddenPasswordField",
  "hiddenCredentialField",
  "autocompleteDisabled",
  "antiAnalysis",
  "delayedPasswordField",
  "formActionChanged",
  "iframeLogin",
  "loginOverlay",
  "brandDomainMismatch",
  "redirectCount",
  "textRisk",
];

const SAFE_VERDICTS = new Set(["trusted", "caution", "risky", "high_risk"]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PASSWORD_VALUE_PATTERN = /\b(?:password|passcode|passwd)\s*[:=]\s*\S+/gi;
const SECRET_VALUE_PATTERN = /\b(?:cookie|session|token|authorization)\s*[:=]\s*\S+/gi;
const LONG_TOKEN_PATTERN = /\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b/gi;

function getHostname(evidence) {
  if (typeof evidence?.hostname === "string" && evidence.hostname) {
    return evidence.hostname.slice(0, 255);
  }

  try {
    return new URL(evidence?.url || evidence?.origin || "").hostname;
  } catch {
    return "";
  }
}

function redactReason(value) {
  return String(value ?? "")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PASSWORD_VALUE_PATTERN, "password [redacted]")
    .replace(SECRET_VALUE_PATTERN, "[redacted]")
    .replace(LONG_TOKEN_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function safeNumber(value, max = 100) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
}

/**
 * Builds the small, allow-listed evidence object that the assistant may use.
 * Full URLs, form fields, page text, passwords, cookie values, and stored
 * fingerprints are intentionally excluded.
 */
export function prepareAssistantEvidence(evidence = {}) {
  const signals = Object.fromEntries(
    SAFE_SIGNAL_KEYS.flatMap((key) => {
      const value = evidence?.signals?.[key];
      if (typeof value === "boolean") return [[key, value]];
      if (Number.isFinite(value)) return [[key, safeNumber(value)]];
      return [];
    }),
  );
  const verdict = SAFE_VERDICTS.has(evidence?.verdict) ? evidence.verdict : "unknown";
  const reasons = Array.isArray(evidence?.reasons)
    ? evidence.reasons
      .map((reason) => redactReason(typeof reason === "object" ? reason?.message : reason))
      .filter(Boolean)
      .slice(0, 4)
    : [];
  const rawClaimedBrands = evidence?.signals?.claimedBrands ?? evidence?.claimedBrands;
  const claimedBrands = Array.isArray(rawClaimedBrands)
    ? rawClaimedBrands
      .filter((brand) => typeof brand === "string")
      .map((brand) => brand.replace(/[^a-z0-9 .&-]/gi, "").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 4)
    : [];

  return {
    hostname: getHostname(evidence),
    verdict,
    scores: {
      finalTrustScore: safeNumber(evidence?.scores?.finalTrustScore),
      urlRisk: safeNumber(evidence?.scores?.urlRisk, 1),
      formRisk: safeNumber(evidence?.scores?.formRisk, 1),
      brandRisk: safeNumber(evidence?.scores?.brandRisk, 1),
    },
    reasons,
    signals,
    claimedBrands,
  };
}
