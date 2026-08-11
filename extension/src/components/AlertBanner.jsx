import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";

const ALERT_CONFIG = {
  trusted: {
    title: "Page looks safe",
    description: "No significant risks were found on this page.",
    Icon: ShieldCheck,
    style: "alert-banner-trusted",
  },
  caution: {
    title: "Caution advised",
    description: "This page contains suspicious signals worth reviewing.",
    Icon: AlertTriangle,
    style: "alert-banner-caution",
  },
  risky: {
    title: "Risky page detected",
    description: "This page is likely suspicious. Avoid entering sensitive information.",
    Icon: ShieldAlert,
    style: "alert-banner-risky",
  },
  "high-risk": {
    title: "High risk page",
    description: "Strong phishing indicators were detected. Do not submit credentials.",
    Icon: ShieldAlert,
    style: "alert-banner-high-risk",
  },
};

export function AlertBanner({ score, verdict, reasons = [] }) {
  const tone = verdict || (score >= 80 ? "trusted" : score >= 50 ? "caution" : score >= 20 ? "risky" : "high-risk");
  const config = ALERT_CONFIG[tone] ?? ALERT_CONFIG.risky;
  const primaryReason = Array.isArray(reasons) && reasons.length > 0 ? reasons[0] : null;

  return (
    <section className={`alert-banner ${config.style}`} aria-label="Page alert">
      <div className="alert-banner-icon">
        <config.Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <div className="alert-banner-title">{config.title}</div>
        <div className="alert-banner-description">{primaryReason || config.description}</div>
      </div>
    </section>
  );
}
