import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { getTrustLabel, getTrustTone } from "../lib/evidence/evidenceSummary";

const ICONS = {
  trusted: ShieldCheck,
  caution: AlertTriangle,
  risky: ShieldAlert,
  "high-risk": ShieldAlert,
};

export function TrustMeter({ score }) {
  const tone = getTrustTone(score);
  const Icon = ICONS[tone] ?? CheckCircle2;
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <section className={`trust-meter trust-meter-${tone}`} aria-label="Current page trust score">
      <div className="trust-score-ring" style={{ "--trust-score": safeScore }}>
        <div className="trust-score-ring-inner">
          <strong>{safeScore}</strong>
          <span>/100</span>
        </div>
      </div>
      <div className="trust-meter-copy">
        <div className="trust-meter-kicker">
          <Icon size={15} aria-hidden="true" />
          Live page assessment
        </div>
        <div className="trust-label">{getTrustLabel(score)}</div>
        <p>{tone === "trusted" ? "No critical signals in the latest scan." : "Review the evidence before sharing sensitive data."}</p>
      </div>
    </section>
  );
}
