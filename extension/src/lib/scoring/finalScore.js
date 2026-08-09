const VERDICTS = {
  TRUSTED: "trusted",
  CAUTION: "caution",
  RISKY: "risky",
  HIGH_RISK: "high_risk",
};

const ALERT_SEVERITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

export function calculateFinalScore({
  urlResult,
  formResult,
  brandResult,
  brandRisk = 0,
  downloadRisk = 0,
  extensionExposureRisk = 0,
} = {}) {
  const urlRisk = clampRisk(urlResult?.risk);
  const formRisk = clampRisk(formResult?.risk);
  const normalizedBrandRisk = clampRisk(brandResult?.risk ?? brandRisk);
  const normalizedDownloadRisk = clampRisk(downloadRisk);
  const normalizedExtensionRisk = clampRisk(extensionExposureRisk);
  const weightedRisk =
    urlRisk * 0.36 +
    formRisk * 0.52 +
    normalizedBrandRisk * 0.06 +
    normalizedDownloadRisk * 0.03 +
    normalizedExtensionRisk * 0.03;
  const synergyRisk = urlRisk >= 0.4 && formRisk >= 0.55 ? 0.06 : 0;
  const finalRisk = clampRisk(
    Math.max(urlRisk, formRisk, normalizedBrandRisk, normalizedDownloadRisk, normalizedExtensionRisk, weightedRisk) + synergyRisk,
  );
  const finalTrustScore = clampTrustScore(100 - Math.round(finalRisk * 100));
  const reasons = collectTopReasons(urlResult?.reasons, formResult?.reasons, brandResult?.reasons);

  if (reasons.length === 0) {
    reasons.push("No high-risk page, URL, or form signals found");
  }

  return {
    scores: {
      urlRisk,
      formRisk,
      brandRisk: normalizedBrandRisk,
      downloadRisk: normalizedDownloadRisk,
      extensionExposureRisk: normalizedExtensionRisk,
      finalTrustScore,
    },
    verdict: getVerdict(finalTrustScore),
    severity: getAlertSeverity(finalTrustScore),
    reasons,
  };
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

function collectTopReasons(...reasonGroups) {
  return reasonGroups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .sort((left, right) => right.weight - left.weight)
    .map((reason) => reason.message)
    .filter((reason, index, allReasons) => allReasons.indexOf(reason) === index)
    .slice(0, 8);
}

function clampRisk(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampTrustScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
