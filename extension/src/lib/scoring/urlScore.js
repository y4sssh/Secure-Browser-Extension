const SUSPICIOUS_TLDS = new Set([
  "accountant",
  "best",
  "biz",
  "cam",
  "click",
  "country",
  "download",
  "fit",
  "gq",
  "info",
  "kim",
  "loan",
  "men",
  "mom",
  "mov",
  "party",
  "pw",
  "quest",
  "rest",
  "review",
  "ru",
  "stream",
  "support",
  "tk",
  "top",
  "work",
  "xyz",
  "zip",
]);

const SUSPICIOUS_TOKENS = [
  "account",
  "auth",
  "banking",
  "billing",
  "confirm",
  "invoice",
  "login",
  "password",
  "recover",
  "secure",
  "session",
  "signin",
  "support",
  "unlock",
  "update",
  "verify",
  "wallet",
];

const BRAND_DOMAINS = {
  amazon: ["amazon.com", "amazon.in", "amazon.co.uk", "aws.amazon.com"],
  apple: ["apple.com", "icloud.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  google: ["google.com", "gmail.com", "google.co.in", "accounts.google.com"],
  hdfc: ["hdfcbank.com"],
  icici: ["icicibank.com"],
  instagram: ["instagram.com"],
  microsoft: ["microsoft.com", "microsoftonline.com", "live.com", "office.com", "outlook.com"],
  netflix: ["netflix.com"],
  paypal: ["paypal.com"],
  sbi: ["onlinesbi.sbi", "sbi.co.in"],
  whatsapp: ["whatsapp.com"],
};

const COMMON_SECOND_LEVEL_TLDS = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const HEX_IPV4_PATTERN = /^0x[0-9a-f]+$/i;

export function scoreUrl(urlValue, options = {}) {
  const features = extractUrlFeatures(urlValue, options);
  const reasons = [];
  let risk = 0.02;

  const add = (weight, message) => {
    risk += weight;
    reasons.push({ source: "url", weight, message });
  };

  if (!features.valid) {
    add(0.28, "URL could not be parsed safely");
    return { risk: clampRisk(risk), features, reasons };
  }

  if (!features.https) add(0.12, "Page is not using HTTPS");
  if (features.usesIpAddress) add(0.24, "Hostname is an IP address instead of a named domain");
  if (features.hasCredentialsInUrl) add(0.28, "URL contains embedded credentials");
  if (features.hasAtSymbol) add(0.16, "URL contains an @ symbol that can hide the real destination");
  if (features.usesPunycode) add(0.18, "Hostname uses punycode, which can indicate a homograph domain");
  if (features.excessiveSubdomains) add(0.12, "Hostname uses an unusual number of subdomains");
  if (features.suspiciousTld) add(0.08, "Top-level domain is commonly abused in suspicious URLs");
  if (features.urlLength > 180) add(0.1, "URL is unusually long");
  else if (features.urlLength > 120) add(0.06, "URL length is above normal");
  if (features.hostnameLength > 55) add(0.08, "Hostname is unusually long");
  if (features.hyphenCount >= 4) add(0.07, "Hostname contains many hyphens");
  if (features.digitRatio > 0.3 && features.hostnameLength > 12) {
    add(0.07, "Hostname contains an unusual amount of digits");
  }
  if (features.domainLooksRandom) add(0.11, "Domain name looks randomly generated");
  if (features.percentEncodedCount >= 3) add(0.06, "URL uses repeated percent encoding");
  if (features.suspiciousTokenCount > 0) {
    add(Math.min(0.16, features.suspiciousTokenCount * 0.04), "URL contains security-themed words often used in phishing");
  }
  if (features.brandDomainMismatch) {
    add(0.22, "URL mentions a known brand but is not on that brand's expected domain");
  }
  if (features.redirectCount >= 2) {
    add(Math.min(0.12, features.redirectCount * 0.04), "Navigation involved multiple redirects");
  }

  return {
    risk: clampRisk(risk),
    features,
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

export function extractUrlFeatures(urlValue, options = {}) {
  const parsed = parseUrl(urlValue);

  if (!parsed) {
    return {
      valid: false,
      https: false,
      redirectCount: safeCount(options.redirectCount),
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const labels = hostname.split(".").filter(Boolean);
  const tld = labels.length > 0 ? labels[labels.length - 1] : "";
  const registrableDomain = getRegistrableDomain(hostname);
  const hostnameWithoutDots = hostname.replace(/\./g, "");
  const suspiciousTokenCount = countSuspiciousTokens(parsed.pathname, parsed.search);
  const brandKeywords = collectBrandKeywords(hostname, parsed.pathname, parsed.search);
  const redirectCount = safeCount(options.redirectCount);
  const digitCount = countMatches(hostname, /\d/g);
  const hostnameLength = hostname.length;
  const hostnameEntropy = shannonEntropy(hostnameWithoutDots);

  return {
    valid: true,
    https: parsed.protocol === "https:",
    protocol: parsed.protocol.replace(":", ""),
    hostnameLength,
    urlLength: parsed.href.length,
    pathLength: parsed.pathname.length,
    queryLength: parsed.search.length,
    queryPresent: parsed.search.length > 0,
    dotCount: Math.max(0, labels.length - 1),
    hyphenCount: countMatches(hostname, /-/g),
    digitCount,
    digitRatio: hostnameLength > 0 ? digitCount / hostnameLength : 0,
    subdomainCount: getSubdomainCount(hostname),
    tld,
    registrableDomain,
    usesIpAddress: isIpAddressHost(hostname),
    usesPunycode: labels.some((label) => label.startsWith("xn--")),
    excessiveSubdomains: getSubdomainCount(hostname) >= 4,
    suspiciousTld: SUSPICIOUS_TLDS.has(tld),
    hasAtSymbol: parsed.href.includes("@"),
    hasCredentialsInUrl: Boolean(parsed.username || parsed.password),
    percentEncodedCount: countMatches(parsed.pathname + parsed.search, /%[0-9a-f]{2}/gi),
    pathTokenCount: parsed.pathname.split(/[/?#._~\-=&]+/).filter(Boolean).length,
    suspiciousTokenCount,
    hostnameEntropy,
    domainLooksRandom: hostnameLength > 18 && hostnameEntropy > 3.7 && (digitCount >= 3 || !/[aeiou]/i.test(hostname)),
    brandKeywords,
    brandDomainMismatch: brandKeywords.some((brand) => !isAllowedBrandHost(brand, hostname, registrableDomain)),
    redirectCount,
  };
}

export function getRegistrableDomain(hostname) {
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");

  const tld = labels[labels.length - 1];
  const secondLevel = labels[labels.length - 2];

  if (tld.length === 2 && COMMON_SECOND_LEVEL_TLDS.has(secondLevel) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

function parseUrl(urlValue) {
  try {
    return new URL(urlValue);
  } catch {
    return null;
  }
}

function countSuspiciousTokens(pathname, search) {
  const haystack = `${pathname} ${search}`.toLowerCase();
  return SUSPICIOUS_TOKENS.filter((token) => haystack.includes(token)).length;
}

function collectBrandKeywords(hostname, pathname, search) {
  const haystack = `${hostname} ${pathname} ${search}`.toLowerCase();
  return Object.keys(BRAND_DOMAINS).filter((brand) => haystack.includes(brand));
}

function isAllowedBrandHost(brand, hostname, registrableDomain) {
  const allowedDomains = BRAND_DOMAINS[brand] ?? [];
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`) || registrableDomain === domain);
}

function getSubdomainCount(hostname) {
  const labels = hostname.split(".").filter(Boolean);
  const registrableLabelCount = getRegistrableDomain(hostname).split(".").filter(Boolean).length;
  return Math.max(0, labels.length - registrableLabelCount);
}

function isIpAddressHost(hostname) {
  return IPV4_PATTERN.test(hostname) || HEX_IPV4_PATTERN.test(hostname) || hostname.includes(":");
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function shannonEntropy(value) {
  if (!value) return 0;

  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  return Array.from(counts.values()).reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
