import React, { useEffect, useState } from "react";
import { Activity, Clock3, Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { loadThreatDecisionHistory } from "../lib/policy/userRiskPolicy.js";

function getSafeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export default function ThreatDecisionTimeline() {
  const [history, setHistory] = useState(() => loadThreatDecisionHistory(getSafeLocalStorage()));

  useEffect(() => {
    setHistory(loadThreatDecisionHistory(getSafeLocalStorage()));
  }, []);

  const exportHistory = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      decisions: history,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "threat_decision_history.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="security-panel decision-panel" aria-label="Recent threat decisions">
      <div className="panel-header panel-header-compact">
        <div>
          <span className="eyebrow">Decision history</span>
          <h3>Recent threat-intel decisions</h3>
        </div>
        <div className="panel-actions policy-export-actions">
          <span className="score-pill score-neutral">{history.length} records</span>
          <button type="button" className="button-secondary compact-button" onClick={exportHistory}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty-state policy-empty-state">No recent threat decisions yet. Risk verdicts will appear here after scanning.</div>
      ) : (
        <div className="decision-timeline">
          {history.map((entry) => {
            const providers = entry.providerBreakdown && typeof entry.providerBreakdown === "object"
              ? Object.entries(entry.providerBreakdown)
              : [];

            const providerSummary = providers
              .filter(([, value]) => value && typeof value === "object")
              .map(([provider, value]) => `${provider}: ${value.status ?? "unknown"}`)
              .join(" • ");

            const badgeClass = entry.policyAction === "block"
              ? "score-risky"
              : entry.policyAction === "warn"
                ? "score-caution"
                : "score-trusted";

            return (
              <article key={entry.id} className="decision-item">
                <div className="decision-item-header">
                  <div className="decision-host-block">
                    <strong>{entry.hostname}</strong>
                    <small>{entry.url || "No URL recorded"}</small>
                  </div>
                  <span className={`score-pill ${badgeClass}`}>{entry.policyAction}</span>
                </div>

                <div className="meta-row decision-meta-row">
                  <span><Clock3 size={14} /> {new Date(entry.timestamp).toLocaleString()}</span>
                  <span><Activity size={14} /> {entry.modelVersion || "unknown-model"}</span>
                </div>

                <div className="decision-summary">
                  <div>
                    <span className="detail-label">Status</span>
                    <strong>{entry.status}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Risk score</span>
                    <strong>{Number(entry.riskScore ?? 0).toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Brand</span>
                    <strong>{entry.brand || "Unspecified"}</strong>
                  </div>
                </div>

                {providerSummary ? (
                  <div className="provider-summary">
                    <ShieldAlert size={14} />
                    <span>{providerSummary}</span>
                  </div>
                ) : (
                  <div className="provider-summary provider-summary-safe">
                    <ShieldCheck size={14} />
                    <span>No provider signals were available.</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
