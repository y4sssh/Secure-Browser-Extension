import { collectKnownBrands, getExpectedBrandDomains, isAllowedBrandHost } from "../brand/brandProfiles.js";
import { getRegistrableDomain } from "./urlScore.js";

export function scoreVisualBrandMismatch({
  pageUrl = "",
  hostname = "",
  title = "",
  favicon = "",
  textSignals = {},
  forms = [],
} = {}) {
  const parsed = parseUrl(pageUrl || hostname);
  const effectiveHostname = (parsed?.hostname ?? hostname ?? "").toLowerCase().replace(/\.$/, "");
  const detectedBrands = collectDetectedBrands(textSignals, forms);
  const faviconHost = getHostFromUrl(favicon);
  const titleText = String(title ?? "").trim();
  const brandCandidates = detectedBrands.length ? detectedBrands : collectKnownBrands(`${titleText} ${favicon} ${effectiveHostname}`);
  const effectiveBrand = brandCandidates[0] ?? "";
  const expectedDomains = effectiveBrand ? getExpectedBrandDomains(effectiveBrand) : [];
  const hostnameMatchesBrand = Boolean(
    effectiveBrand &&
      (effectiveHostname.includes(effectiveBrand.toLowerCase()) ||
        expectedDomains.some((domain) => effectiveHostname === domain || effectiveHostname.endsWith(`.${domain}`))),
  );
  const faviconMatchesBrand = Boolean(
    effectiveBrand &&
      faviconHost &&
      (faviconHost.includes(effectiveBrand.toLowerCase()) ||
        expectedDomains.some((domain) => faviconHost === domain || faviconHost.endsWith(`.${domain}`))),
  );
  const titleMatchesBrand = Boolean(
    effectiveBrand && titleText && titleText.toLowerCase().includes(effectiveBrand.toLowerCase()),
  );
  const mismatch = Boolean(
    effectiveBrand &&
      !hostnameMatchesBrand &&
      (titleMatchesBrand || faviconMatchesBrand || hasCredentialContext(forms, textSignals)),
  );

  // A legitimate brand page naturally has a matching title, favicon, and
  // credential form. These are comparison inputs, not risk signals by
  // themselves. Only score them once the host fails that brand comparison.
  let risk = 0;
  const reasons = [];

  const add = (weight, message) => {
    risk += weight;
    reasons.push(message);
  };

  if (!effectiveBrand) {
    return {
      risk: 0,
      mismatch: false,
      detectedBrand: "",
      reasons: ["No brand-like identity cues were detected for visual comparison"],
      features: {
        expectedDomains: [],
        brandCandidates: [],
        hostnameMatchesBrand: false,
        faviconMatchesBrand: false,
        titleMatchesBrand: false,
      },
    };
  }

  if (mismatch && titleMatchesBrand) {
    add(0.16, `Page title references ${effectiveBrand}, which is a strong visual-brand cue`);
  }

  if (mismatch && faviconMatchesBrand) {
    add(0.08, `Favicon resolves to an expected ${effectiveBrand} host`);
  }

  if (mismatch) {
    add(0.42, `Visual branding suggests ${effectiveBrand} but the page host is not on an expected ${effectiveBrand} domain`);
  }

  if (mismatch && hasCredentialContext(forms, textSignals)) {
    add(0.18, "Credential flow is present alongside brand impersonation cues");
  }

  if (mismatch && effectiveHostname && !hostnameMatchesBrand && !effectiveHostname.includes(effectiveBrand.toLowerCase())) {
    add(0.12, `Hostname ${effectiveHostname} does not align with the expected ${effectiveBrand} identity`);
  }

  return {
    risk: clampRisk(risk),
    mismatch,
    detectedBrand: effectiveBrand,
    reasons: reasons.slice(0, 6),
    features: {
      expectedDomains,
      actualDomain: effectiveHostname ? getRegistrableDomain(effectiveHostname) : "",
      hostnameMatchesBrand,
      faviconMatchesBrand,
      titleMatchesBrand,
      detectedBrands: brandCandidates,
      credentialContext: hasCredentialContext(forms, textSignals),
      visualSignalCount: [titleMatchesBrand, faviconMatchesBrand, hostnameMatchesBrand].filter(Boolean).length,
    },
  };
}

function collectDetectedBrands(textSignals = {}, forms = []) {
  const combined = [
    ...(Array.isArray(textSignals?.claimedBrands) ? textSignals.claimedBrands : []),
    ...(Array.isArray(textSignals?.snippets) ? collectKnownBrands(textSignals.snippets.map((snippet) => snippet?.text ?? "")) : []),
    ...(Array.isArray(forms) ? forms.flatMap((form) => Array.isArray(form?.claimedBrands) ? form.claimedBrands : []) : []),
  ];

  return Array.from(new Set(combined.filter(Boolean))).slice(0, 4);
}

function hasCredentialContext(forms = [], textSignals = {}) {
  const safeForms = Array.isArray(forms) ? forms : [];
  return (
    Boolean(textSignals.hasLoginText || textSignals.loginTextSignalCount > 0) ||
    safeForms.some(
      (form) =>
        Number(form?.passwordFieldCount ?? 0) > 0 ||
        Number(form?.emailFieldCount ?? 0) > 0 ||
        Number(form?.userLikeFieldCount ?? 0) > 0 ||
        Boolean(form?.hasLoginText),
    )
  );
}

function getHostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
