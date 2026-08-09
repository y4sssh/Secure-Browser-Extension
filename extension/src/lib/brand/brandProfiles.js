export const BRAND_PROFILES = Object.freeze({
  amazon: {
    label: "Amazon",
    domains: ["amazon.com", "amazon.in", "amazon.co.uk", "aws.amazon.com"],
    aliases: ["amazon", "aws"],
  },
  apple: {
    label: "Apple",
    domains: ["apple.com", "icloud.com"],
    aliases: ["apple", "icloud"],
  },
  facebook: {
    label: "Facebook",
    domains: ["facebook.com", "fb.com", "meta.com"],
    aliases: ["facebook", "meta"],
  },
  google: {
    label: "Google",
    domains: ["google.com", "gmail.com", "google.co.in", "accounts.google.com"],
    aliases: ["google", "gmail", "google workspace"],
  },
  hdfc: {
    label: "HDFC",
    domains: ["hdfcbank.com"],
    aliases: ["hdfc", "hdfc bank"],
  },
  icici: {
    label: "ICICI",
    domains: ["icicibank.com"],
    aliases: ["icici", "icici bank"],
  },
  instagram: {
    label: "Instagram",
    domains: ["instagram.com"],
    aliases: ["instagram"],
  },
  microsoft: {
    label: "Microsoft",
    domains: ["microsoft.com", "microsoftonline.com", "live.com", "office.com", "outlook.com"],
    aliases: ["microsoft", "microsoft account", "office 365", "outlook", "onedrive"],
  },
  netflix: {
    label: "Netflix",
    domains: ["netflix.com"],
    aliases: ["netflix"],
  },
  paypal: {
    label: "PayPal",
    domains: ["paypal.com"],
    aliases: ["paypal", "pay pal"],
  },
  sbi: {
    label: "SBI",
    domains: ["onlinesbi.sbi", "sbi.co.in"],
    aliases: ["sbi", "state bank of india"],
  },
  whatsapp: {
    label: "WhatsApp",
    domains: ["whatsapp.com"],
    aliases: ["whatsapp", "whats app"],
  },
});

export function collectKnownBrands(fragments, limit = 4) {
  const haystack = normalizeHaystack(fragments);

  return Object.entries(BRAND_PROFILES)
    .filter(([, profile]) => profile.aliases.some((alias) => phraseMatches(haystack, alias)))
    .map(([, profile]) => profile.label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .slice(0, limit);
}

export function getExpectedBrandDomains(label) {
  return getBrandProfileByLabel(label)?.domains ?? [];
}

export function getBrandProfileByLabel(label) {
  const normalizedLabel = String(label ?? "").trim().toLowerCase();
  return Object.values(BRAND_PROFILES).find((profile) => profile.label.toLowerCase() === normalizedLabel) ?? null;
}

export function getBrandLabelFromKey(brandKey) {
  return BRAND_PROFILES[brandKey]?.label ?? "";
}

export function isAllowedBrandHost(label, hostname, registrableDomain = "") {
  const allowedDomains = getExpectedBrandDomains(label);
  return hostMatchesAllowedDomains(hostname, registrableDomain, allowedDomains);
}

export function isAllowedBrandHostByKey(brandKey, hostname, registrableDomain = "") {
  const allowedDomains = BRAND_PROFILES[brandKey]?.domains ?? [];
  return hostMatchesAllowedDomains(hostname, registrableDomain, allowedDomains);
}

function hostMatchesAllowedDomains(hostname, registrableDomain, allowedDomains) {
  const normalizedHost = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  const normalizedRegistrableDomain = String(registrableDomain ?? "").toLowerCase();

  if (!normalizedHost || allowedDomains.length === 0) {
    return false;
  }

  return allowedDomains.some(
    (domain) =>
      normalizedHost === domain ||
      normalizedHost.endsWith(`.${domain}`) ||
      normalizedRegistrableDomain === domain,
  );
}

function normalizeHaystack(fragments) {
  return (Array.isArray(fragments) ? fragments : [fragments])
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function phraseMatches(haystack, phrase) {
  const normalizedPhrase = String(phrase ?? "").toLowerCase().trim();
  if (!normalizedPhrase) return false;

  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedPhrase)}([^a-z0-9]|$)`, "i").test(haystack);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
