export function getTrustTone(score) {
  if (score >= 80) return "trusted";
  if (score >= 50) return "caution";
  if (score >= 20) return "risky";
  return "high-risk";
}

export function getTrustLabel(score) {
  if (score >= 80) return "Trusted";
  if (score >= 50) return "Caution";
  if (score >= 20) return "Risky";
  return "High risk";
}

export function formatTimestamp(value) {
  if (!value) return "No scan yet";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getPrimaryScore(evidence) {
  return Number.isFinite(evidence?.scores?.finalTrustScore)
    ? evidence.scores.finalTrustScore
    : 0;
}
