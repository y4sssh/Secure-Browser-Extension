import { evaluateUserRiskPolicy } from "../policy/userRiskPolicy.js";
import { runHybridRiskModel } from "./modelPipeline.js";

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
  visualResult,
  brandRisk = 0,
  downloadRisk = 0,
  extensionExposureRisk = 0,
  visualRisk = 0,
  policy = null,
  hostname = "",
} = {}) {
  const urlRisk = clampRisk(urlResult?.risk);
  const formRisk = clampRisk(formResult?.risk);
  const normalizedBrandRisk = clampRisk(brandResult?.risk ?? brandRisk);
  const normalizedVisualRisk = clampRisk(visualResult?.risk ?? visualRisk);
  const normalizedDownloadRisk = clampRisk(downloadRisk);
  const normalizedExtensionRisk = clampRisk(extensionExposureRisk);
  const weightedRisk =
    urlRisk * 0.36 +
    formRisk * 0.52 +
    normalizedBrandRisk * 0.06 +
    normalizedVisualRisk * 0.04 +
    normalizedDownloadRisk * 0.01 +
    normalizedExtensionRisk * 0.01;
  const synergyRisk = urlRisk >= 0.4 && formRisk >= 0.55 ? 0.06 : 0;
  const finalRisk = clampRisk(
    Math.max(urlRisk, formRisk, normalizedBrandRisk, normalizedVisualRisk, normalizedDownloadRisk, normalizedExtensionRisk, weightedRisk) + synergyRisk,
  );

  const modelResult = runHybridRiskModel({
    urlRisk,
    formRisk,
    brandRisk: normalizedBrandRisk,
    visualRisk: normalizedVisualRisk,
    payload: { hostname, domain: hostname },
  });

  const scoreFromModel = clampTrustScore(modelResult.finalScore);
  const finalTrustScore = clampTrustScore(100 - Math.round(finalRisk * 100));
  const reasons = collectTopReasons(
    urlResult?.reasons,
    formResult?.reasons,
    brandResult?.reasons,
    visualResult?.reasons,
    modelResult?.reasons,
  );

  const policyDecision = evaluateUserRiskPolicy(policy, {
    hostname,
    finalTrustScore,
    reasons,
  });

  let adjustedTrustScore = finalTrustScore;
  if (policyDecision.action === "block") {
    adjustedTrustScore = 0;
  } else if (policyDecision.action === "warn") {
    adjustedTrustScore = Math.min(adjustedTrustScore, 40);
  }

  const finalVerdict = getVerdict(adjustedTrustScore);
  const finalSeverity = getAlertSeverity(adjustedTrustScore);

  if (reasons.length === 0) {
    reasons.push("No high-risk page, URL, or form signals found");
  }

  if (policyDecision.action !== "allow") {
    reasons.push(policyDecision.reason);
  }

  return {
    scores: {
      urlRisk,
      formRisk,
      brandRisk: normalizedBrandRisk,
      visualRisk: normalizedVisualRisk,
      downloadRisk: normalizedDownloadRisk,
      extensionExposureRisk: normalizedExtensionRisk,
      finalTrustScore: adjustedTrustScore,
      modelScore: scoreFromModel,
      policyAction: policyDecision.action,
    },
    verdict: finalVerdict,
    severity: finalSeverity,
    reasons: reasons.slice(0, 8),
    model: modelResult,
    policy: policyDecision,
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
