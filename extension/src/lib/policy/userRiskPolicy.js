const DEFAULT_POLICY = {
  allowList: ["login.microsoftonline.com", "accounts.google.com", "www.paypal.com", "login.paypal.com"],
  blockList: ["evil-login.example", "fake-login.example", "amazon-signin.example"],
  riskThreshold: 75,
  warnThreshold: 25,
};

export function loadUserRiskPolicy(overrides = {}, storage = null) {
  const resolved = storage && typeof storage.getItem === "function" ? readStoredPolicy(storage) : {};
  return normalizePolicy({ ...DEFAULT_POLICY, ...resolved, ...overrides });
}

export function saveUserRiskPolicy(policy = {}, storage = null) {
  const normalized = normalizePolicy(policy);
  if (storage && typeof storage.setItem === "function") {
    storage.setItem("secureBrowser.userRiskPolicy", JSON.stringify(normalized));
  }
  return normalized;
}

export function loadThreatDecisionHistory(storage = null) {
  const resolved = storage && typeof storage.getItem === "function" ? readStoredThreatDecisions(storage) : [];
  return Array.isArray(resolved) ? resolved.slice(0, 25) : [];
}

export function saveThreatDecisionHistory(history = [], storage = null) {
  const normalized = Array.isArray(history) ? history.slice(0, 25) : [];
  if (storage && typeof storage.setItem === "function") {
    storage.setItem("secureBrowser.threatDecisionHistory", JSON.stringify(normalized));
  }
  return normalized;
}

export function appendThreatDecisionHistory(entry = {}, storage = null) {
  const normalized = {
    id: String(entry.id ?? entry.decisionId ?? `decision-${Date.now()}`),
    hostname: String(entry.hostname ?? "unknown").toLowerCase(),
    url: String(entry.url ?? ""),
    brand: String(entry.brand ?? ""),
    status: String(entry.status ?? "unknown"),
    policyAction: String(entry.policyAction ?? entry.policy_action ?? "allow"),
    riskScore: Number(entry.riskScore ?? entry.risk_score ?? 0),
    modelVersion: String(entry.modelVersion ?? entry.model_version ?? "unknown"),
    providerBreakdown: entry.providerBreakdown ?? entry.provider_breakdown ?? {},
    modelMetadata: entry.modelMetadata ?? entry.model_metadata ?? {},
    timestamp: String(entry.timestamp ?? new Date().toISOString()),
  };

  const existing = loadThreatDecisionHistory(storage);
  const nextHistory = [normalized, ...existing.filter((item) => item.id !== normalized.id)].slice(0, 25);
  saveThreatDecisionHistory(nextHistory, storage);
  return nextHistory;
}

export function evaluateUserRiskPolicy(policy = {}, evidence = {}) {
  const safePolicy = policy ?? {};
  const normalized = normalizePolicy(safePolicy);
  const hostname = String(evidence.hostname ?? "").trim().toLowerCase();
  const finalTrustScore = Number(evidence.finalTrustScore ?? 100);
  const reasons = Array.isArray(evidence.reasons) ? evidence.reasons : [];

  if (hostname && normalized.blockList.some((blocked) => hostname === blocked.toLowerCase())) {
    return {
      action: "block",
      policy: normalized,
      reason: `Host ${hostname} is explicitly blocked by user policy`,
    };
  }

  if (hostname && normalized.allowList.some((allowed) => hostname === allowed.toLowerCase())) {
    return {
      action: "allow",
      policy: normalized,
      reason: `Host ${hostname} is trusted by the user allow list`,
    };
  }

  const riskThreshold = clampScore(normalized.riskThreshold, 0, 100);
  const warnThreshold = clampScore(normalized.warnThreshold, 0, 100);

  if (finalTrustScore <= warnThreshold || reasons.some((reason) => /brand|impersonat|phish/i.test(String(reason)))) {
    return {
      action: "warn",
      policy: normalized,
      reason: `Risky page still requires review before user interaction on ${hostname || "this host"}`,
    };
  }

  if (finalTrustScore <= 100 - riskThreshold) {
    return {
      action: "warn",
      policy: normalized,
      reason: `The current score is below the user risk threshold for ${hostname || "this host"}`,
    };
  }

  return {
    action: "allow",
    policy: normalized,
    reason: `${hostname || "This host"} is within the user-configured baseline policy`,
  };
}

function normalizePolicy(policy = {}) {
  return {
    allowList: normalizeStringList(policy.allowList),
    blockList: normalizeStringList(policy.blockList),
    riskThreshold: clampScore(Number(policy.riskThreshold ?? DEFAULT_POLICY.riskThreshold), 0, 100),
    warnThreshold: clampScore(Number(policy.warnThreshold ?? DEFAULT_POLICY.warnThreshold), 0, 100),
  };
}

function normalizeStringList(list = []) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter(Boolean)
    .filter((entry, index, entries) => entries.indexOf(entry) === index);
}

function readStoredPolicy(storage) {
  try {
    const raw = storage.getItem("secureBrowser.userRiskPolicy");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readStoredThreatDecisions(storage) {
  try {
    const raw = storage.getItem("secureBrowser.threatDecisionHistory");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clampScore(value, min, max) {
  const numeric = Number.isFinite(value) ? Number(value) : min;
  return Math.min(max, Math.max(min, numeric));
}
