export function runHybridRiskModel({
  urlRisk = 0,
  formRisk = 0,
  brandRisk = 0,
  visualRisk = 0,
  payload = {},
} = {}) {
  const normalizedUrlRisk = clampRisk(urlRisk);
  const normalizedFormRisk = clampRisk(formRisk);
  const normalizedBrandRisk = clampRisk(brandRisk);
  const normalizedVisualRisk = clampRisk(visualRisk);
  const hybridWeight =
    normalizedUrlRisk * 0.28 +
    normalizedFormRisk * 0.34 +
    normalizedBrandRisk * 0.18 +
    normalizedVisualRisk * 0.2;
  const finalScore = clampTrustScore(100 - Math.round(hybridWeight * 100));
  const reasons = [];

  if (normalizedUrlRisk > 0.45) {
    reasons.push("URL heuristic risk increased the hybrid model score");
  }
  if (normalizedFormRisk > 0.5) {
    reasons.push("Form risk contributed materially to the final verdict");
  }
  if (normalizedBrandRisk > 0.45) {
    reasons.push("Brand impersonation risk was included in the model output");
  }
  if (normalizedVisualRisk > 0.5) {
    reasons.push("Visual brand mismatch added a strong phishing signal");
  }
  if (!reasons.length) {
    reasons.push("Hybrid model used baseline pattern checks without elevated risk signals");
  }

  return {
    modelVersion: "secure-browser-hybrid-v1",
    finalScore,
    weightedRisk: clampRisk(hybridWeight),
    confidence: clampTrustScore(Math.round((normalizedUrlRisk + normalizedFormRisk + normalizedBrandRisk + normalizedVisualRisk) / 0.04)),
    reasons: reasons.slice(0, 6),
    payload: {
      hostname: payload.hostname ?? "",
      domain: payload.domain ?? "",
    },
  };
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampTrustScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
