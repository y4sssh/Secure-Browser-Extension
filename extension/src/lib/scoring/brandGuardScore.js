import {
  collectKnownBrands,
  getBrandLabelFromKey,
  getExpectedBrandDomains,
  isAllowedBrandHost,
} from "../brand/brandProfiles.js";
import { getRegistrableDomain } from "./urlScore.js";

const LOGIN_OR_CREDENTIAL_PATTERN =
  /\b(log\s*in|sign\s*in|signin|password|passcode|otp|verify|verification|account|username|email|credential|authenticate)\b/i;
const URGENCY_PATTERN = /\b(urgent|immediate|suspended|locked|disabled|unusual activity|security alert|restore|limited access)\b/i;
const PHISHING_ACTION_PATTERN = /\b(confirm|update|recover|unlock|validate|review|secure|continue|reauthenticate)\b/i;

export function scoreBrandGuard({
  pageUrl,
  claimedBrands = [],
  forms = [],
  textSignals = {},
  urlFeatures = {},
} = {}) {
  const parsedPageUrl = parseUrl(pageUrl);
  const hostname = parsedPageUrl?.hostname?.toLowerCase().replace(/\.$/, "") ?? "";
  const actualDomain = hostname ? getRegistrableDomain(hostname) : "";
  const textResult = scoreTextSignals(textSignals);
  const detectedBrands = collectDetectedBrands(claimedBrands, textSignals, urlFeatures);
  const mismatchBrands = detectedBrands.filter((brand) => !isAllowedBrandHost(brand, hostname, actualDomain));
  const primaryClaimedBrand = detectedBrands[0] ?? "";
  const credentialContext = hasCredentialContext(forms, textSignals);
  const domainMismatch = mismatchBrands.length > 0;
  const reasons = [...textResult.reasons];
  let risk = textResult.risk;

  const add = (weight, message) => {
    risk += weight;
    reasons.push({ source: "brand", weight, message });
  };

  const floor = (minimumRisk, message) => {
    risk = Math.max(risk, minimumRisk);
    reasons.push({ source: "brand", weight: minimumRisk, message });
  };

  if (domainMismatch && credentialContext) {
    floor(
      0.9,
      `Page claims ${mismatchBrands[0]} identity but actual domain is ${actualDomain || hostname || "unknown"}`,
    );
  } else if (domainMismatch) {
    floor(
      0.56,
      `Page claims ${mismatchBrands[0]} identity from outside its expected domains`,
    );
  }

  if (urlFeatures.brandDomainMismatch) {
    add(0.12, "URL contains a known brand name outside the brand's expected domain");
  }

  if (detectedBrands.length > 1 && credentialContext) {
    add(0.08, "Page mixes multiple known brand identities around a credential flow");
  }

  if (textResult.features.hasUrgencyCue && credentialContext) {
    add(0.1, "Login text uses urgency or account-recovery language");
  }

  return {
    risk: clampRisk(risk),
    features: {
      actualHostname: hostname,
      actualDomain,
      claimedBrand: primaryClaimedBrand,
      claimedBrands: detectedBrands,
      expectedDomains: primaryClaimedBrand ? getExpectedBrandDomains(primaryClaimedBrand) : [],
      mismatchBrands,
      domainMismatch,
      credentialContext,
      textRisk: textResult.risk,
      textSnippetCount: textResult.features.snippetCount,
      textSources: textResult.features.sources,
      cloudAnalysisEligible: textResult.features.snippetCount > 0,
      localModelVersion: "brandguard-text-rules-v1",
    },
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

export function scoreTextSignals(textSignals = {}) {
  const snippets = normalizeSnippets(textSignals.snippets);
  const haystack = snippets.map((snippet) => snippet.text).join(" ");
  const sources = snippets
    .map((snippet) => snippet.source)
    .filter((source, index, allSources) => source && allSources.indexOf(source) === index);
  const features = {
    snippetCount: snippets.length,
    sources,
    hasLoginCue: LOGIN_OR_CREDENTIAL_PATTERN.test(haystack),
    hasUrgencyCue: URGENCY_PATTERN.test(haystack),
    hasPhishingActionCue: PHISHING_ACTION_PATTERN.test(haystack),
    claimedBrands: collectKnownBrands(snippets.map((snippet) => snippet.text)),
  };
  const reasons = [];
  let risk = snippets.length > 0 ? 0.03 : 0;

  const add = (weight, message) => {
    risk += weight;
    reasons.push({ source: "text", weight, message });
  };

  if (features.hasLoginCue) {
    add(0.12, "Safe page text contains login or credential language");
  }

  if (features.hasUrgencyCue) {
    add(0.12, "Safe page text contains urgency or account-lockout language");
  }

  if (features.hasPhishingActionCue && features.hasLoginCue) {
    add(0.1, "Safe page text asks the user to verify or recover account access");
  }

  if (features.claimedBrands.length > 0 && features.hasLoginCue) {
    add(0.08, "Safe page text combines a known brand with credential prompts");
  }

  return {
    risk: clampRisk(risk),
    features,
    reasons,
  };
}

function collectDetectedBrands(claimedBrands, textSignals, urlFeatures) {
  const fromText = collectKnownBrands((textSignals.snippets ?? []).map((snippet) => snippet?.text ?? snippet));
  const fromUrl = Array.isArray(urlFeatures.brandKeywords)
    ? urlFeatures.brandKeywords.map(getBrandLabelFromKey).filter(Boolean)
    : [];

  return [...normalizeBrands(claimedBrands), ...fromText, ...fromUrl]
    .filter(Boolean)
    .filter((brand, index, brands) => brands.indexOf(brand) === index)
    .slice(0, 4);
}

function hasCredentialContext(forms, textSignals) {
  const safeForms = Array.isArray(forms) ? forms : [];
  return (
    Boolean(textSignals.hasLoginText) ||
    safeCount(textSignals.loginTextSignalCount) > 0 ||
    safeForms.some(
      (form) =>
        safeCount(form.passwordFieldCount) > 0 ||
        safeCount(form.emailFieldCount) > 0 ||
        safeCount(form.userLikeFieldCount) > 0 ||
        safeCount(form.loginTextSignalCount) > 0 ||
        form.hasLoginText,
    )
  );
}

function normalizeSnippets(snippets) {
  if (!Array.isArray(snippets)) return [];

  return snippets
    .map((snippet) => ({
      source: String(snippet?.source ?? "text").trim().slice(0, 32),
      text: String(snippet?.text ?? snippet ?? "").trim().slice(0, 160),
    }))
    .filter((snippet) => snippet.text.length > 0)
    .slice(0, 16);
}

function normalizeBrands(brands) {
  if (!Array.isArray(brands)) return [];

  return brands
    .filter((brand) => typeof brand === "string" && brand.trim().length > 0)
    .map((brand) => brand.trim())
    .filter((brand, index, allBrands) => allBrands.indexOf(brand) === index)
    .slice(0, 4);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
