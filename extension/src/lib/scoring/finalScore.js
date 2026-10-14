import { evaluateUserRiskPolicy } from "../policy/userRiskPolicy.js";
import { scoreBehavioralSignals, scoreThreatIntelSignals } from "./behavioralSignals.js";
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
  behavioralResult,
  reputationResult,
  brandRisk = 0,
  downloadRisk = 0,
  extensionExposureRisk = 0,
  visualRisk = 0,
  behavioralRisk = 0,
  reputationRisk = 0,
  policy = null,
  hostname = "",
} = {}) {
  const urlRisk = clampRisk(urlResult?.risk);
  const formRisk = clampRisk(formResult?.risk);
  const normalizedBrandRisk = clampRisk(brandResult?.risk ?? brandRisk);
  const normalizedVisualRisk = clampRisk(visualResult?.risk ?? visualRisk);
  const normalizedDownloadRisk = clampRisk(downloadRisk);
  const normalizedExtensionRisk = clampRisk(extensionExposureRisk);
  const normalizedBehavioralRisk = clampRisk(behavioralResult?.risk ?? behavioralRisk);
  const normalizedReputationRisk = clampRisk(reputationResult?.risk ?? reputationRisk);
  const weightedRisk =
    urlRisk * 0.24 +
    formRisk * 0.34 +
    normalizedBrandRisk * 0.12 +
    normalizedVisualRisk * 0.09 +
    normalizedBehavioralRisk * 0.14 +
    normalizedReputationRisk * 0.06 +
    normalizedDownloadRisk * 0.01 +
    normalizedExtensionRisk * 0.01;
  const synergyRisk = urlRisk >= 0.4 && formRisk >= 0.55 ? 0.06 : 0;
  const finalRisk = clampRisk(
    Math.max(
      urlRisk,
      formRisk,
      normalizedBrandRisk,
      normalizedVisualRisk,
      normalizedBehavioralRisk,
      normalizedReputationRisk,
      normalizedDownloadRisk,
      normalizedExtensionRisk,
      weightedRisk,
    ) + synergyRisk,
  );

  const resolvedBehavioral = behavioralResult ??
    scoreBehavioralSignals({
      forms: formResult?.aggregate ? formResult.aggregate : formResult?.forms ?? [],
      timeline: formResult?.aggregate?.timeline ?? [],
      redirectCount: urlResult?.features?.redirectCount ?? 0,
      brandRisk: normalizedBrandRisk,
      hostname,
    });
  const resolvedReputation = reputationResult ??
    scoreThreatIntelSignals({
      hostname,
      brandDomainMismatch: Boolean(brandResult?.features?.domainMismatch || urlResult?.features?.brandDomainMismatch),
      redirectCount: urlResult?.features?.redirectCount ?? 0,
      pageRisk: Math.max(urlRisk, formRisk, normalizedBrandRisk, normalizedVisualRisk),
    });

  const modelResult = runHybridRiskModel({
    urlRisk,
    formRisk,
    brandRisk: normalizedBrandRisk,
    visualRisk: normalizedVisualRisk,
    behavioralRisk: resolvedBehavioral.risk,
    reputationRisk: resolvedReputation.risk,
    payload: { hostname, domain: hostname },
  });

  const scoreFromModel = clampTrustScore(modelResult.finalScore);
  const finalTrustScore = clampTrustScore(100 - Math.round(finalRisk * 100));
  const reasons = collectTopReasons(
    urlResult?.reasons,
    formResult?.reasons,
    brandResult?.reasons,
    visualResult?.reasons,
    resolvedBehavioral?.reasons,
    resolvedReputation?.reasons,
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
      behavioralRisk: resolvedBehavioral.risk,
      reputationRisk: resolvedReputation.risk,
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
