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

  return (
    <section className={`trust-meter trust-meter-${tone}`} aria-label="Current page trust score">
      <div className="trust-meter-icon">
        <Icon size={28} aria-hidden="true" />
      </div>
      <div>
        <div className="trust-score">{score}</div>
        <div className="trust-label">{getTrustLabel(score)}</div>
      </div>
    </section>
  );
}
