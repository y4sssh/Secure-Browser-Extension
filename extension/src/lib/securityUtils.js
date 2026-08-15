const DANGEROUS_DOWNLOAD_EXTENSIONS = new Set([
  "exe",
  "msi",
  "bat",
  "cmd",
  "scr",
  "js",
  "vbs",
  "jar",
  "ps1",
  "iso",
  "apk",
]);

const SUSPICIOUS_DOWNLOAD_TOKENS = [
  "invoice",
  "secure",
  "login",
  "account",
  "payment",
  "update",
  "verify",
  "confirm",
  "receipt",
  "statement",
];

export function estimatePasswordStrength(password) {
  if (typeof password !== "string" || password.length === 0) {
    return 0;
  }

  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].reduce(
    (count, pattern) => count + (pattern.test(password) ? 1 : 0),
    0,
  );
  const lengthScore = Math.min(password.length / 16, 1);
  const varietyScore = (categories - 1) * 0.2;
  const baseScore = Math.max(0, Math.min(1, lengthScore + varietyScore * 0.5));

  if (password.length < 6) {
    return Math.min(baseScore, 0.22);
  }

  return Math.max(0, Math.min(1, baseScore));
}

export function formatPasswordStrength(value) {
  if (!Number.isFinite(value)) {
    return "Unknown";
  }
  if (value >= 0.8) return "Strong";
  if (value >= 0.5) return "Moderate";
  if (value > 0) return "Weak";
  return "None";
}

export function formatRiskScore(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function hasDoubleExtension(filename) {
  if (typeof filename !== "string") return false;
  const normalized = filename.toLowerCase();
  const parts = normalized.split(".").filter(Boolean);
  return parts.length >= 3 && DANGEROUS_DOWNLOAD_EXTENSIONS.has(parts[parts.length - 1]);
}

export function scoreDownloadItem(download) {
  const warnings = [];
  let risk = 0.03;
  const filename = (download.filename || "").toLowerCase();
  const danger = download.danger || "";
  const url = download.url || "";

  if (danger.includes("danger")) {
    risk += 0.35;
    warnings.push("Browser marked the download as potentially dangerous");
  }

  const extension = filename.split(".").pop() || "";
  if (DANGEROUS_DOWNLOAD_EXTENSIONS.has(extension)) {
    risk += 0.24;
    warnings.push(`Downloaded file has a risky extension .${extension}`);
  }

  if (hasDoubleExtension(filename)) {
    risk += 0.18;
    warnings.push("Filename uses a double extension that can hide executable content");
  }

  if (SUSPICIOUS_DOWNLOAD_TOKENS.some((token) => url.toLowerCase().includes(token))) {
    risk += 0.1;
    warnings.push("Download source URL contains suspicious security-related terms");
  }

  if (filename.includes("\u202e")) {
    risk += 0.12;
    warnings.push("Filename contains a right-to-left override character");
  }

  return {
    score: Math.max(0, Math.min(1, risk)),
    reasons: warnings,
    filename,
    extension,
  };
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function scoreExtensionItem(extension) {
  let risk = 0.04;
  const reasons = [];

  // Penalize development/sideloaded installs (higher risk)
  if (extension.installType === "development" || extension.installType === "sideload") {
    risk += 0.18;
    reasons.push("Extension is installed as sideloaded or development mode");
  }

  // Permission weight table — higher weight = more sensitive
  const PERMISSION_WEIGHTS = {
    webRequestBlocking: 0.25,
    webRequest: 0.22,
    cookies: 0.20,
    nativeMessaging: 0.18,
    history: 0.15,
    management: 0.14,
    scripting: 0.12,
    downloads: 0.10,
    clipboardRead: 0.09,
    clipboardWrite: 0.06,
    tabs: 0.06,
    activeTab: 0.02,
  };

  const permissions = normalizeStringList(extension.permissions || [], 128);
  let permRisk = 0;
  const matchedPerms = [];
  for (const p of permissions) {
    const weight = PERMISSION_WEIGHTS[p] ?? 0;
    if (weight > 0) {
      permRisk += weight;
      matchedPerms.push(p);
    }
  }

  if (matchedPerms.length > 0) {
    risk += Math.min(0.6, permRisk);
    reasons.push(`Extension requests sensitive permissions: ${matchedPerms.join(", ")}`);
  }

  // Host permission scoring: broad host access is high risk
  const hostPermissions = normalizeStringList(extension.hostPermissions || [], 256);
  let hostRisk = 0;
  const flaggedHosts = [];

  const hasAllUrls = hostPermissions.includes("<all_urls>") || hostPermissions.includes("*://*/*");
  if (hasAllUrls) {
    hostRisk += 0.32;
    flaggedHosts.push("<all_urls>");
  }

  // Wildcard host patterns like *://*.example.com/* or patterns containing '*' are higher risk
  const wildcardPatterns = hostPermissions.filter((h) => h.includes("*") && !h.includes("<all_urls>"));
  if (wildcardPatterns.length > 0) {
    // each wildcard pattern contributes a small risk, capped
    hostRisk += Math.min(0.28, wildcardPatterns.length * 0.07);
    flaggedHosts.push(...wildcardPatterns.slice(0, 3));
  }

  // Many explicit host permissions is also a risk signal
  if (hostPermissions.length > 8) {
    hostRisk += 0.14;
    reasons.push("Extension requests many host permissions");
  } else if (hostPermissions.length > 3) {
    hostRisk += 0.06;
  }

  if (flaggedHosts.length > 0) {
    reasons.push(`Broad host access patterns: ${flaggedHosts.slice(0, 3).join(", ")}`);
  }

  risk += hostRisk;

  // If extension is disabled, reduce risk slightly
  if (!extension.enabled) {
    risk = Math.max(0, risk - 0.05);
  }

  return {
    score: Math.max(0, Math.min(1, risk)),
    reasons: Array.from(new Set(reasons)),
  };
}

export function scoreCookieItem(cookie) {
  let risk = 0;
  const reasons = [];

  if (!cookie.secure) {
    risk += 0.18;
    reasons.push("Cookie is not marked secure");
  }
  if (!cookie.httpOnly) {
    risk += 0.14;
    reasons.push("Cookie is readable from JavaScript without HttpOnly");
  }
  if (!cookie.sameSite || cookie.sameSite === "no_restriction") {
    risk += 0.12;
    reasons.push("Cookie does not enforce SameSite restrictions");
  }
  if (cookie.expiryDays >= 30) {
    risk += 0.08;
    reasons.push("Cookie expires far in the future");
  }

  return {
    score: Math.max(0, Math.min(1, risk)),
    reasons,
  };
}

export function normalizeStringList(values, maxLength) {
  return Array.isArray(values)
    ? values.map((value) => String(value).slice(0, maxLength)).filter(Boolean)
    : [];
}
