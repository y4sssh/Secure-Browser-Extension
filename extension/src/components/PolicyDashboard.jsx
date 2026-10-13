import React, { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import ThreatDecisionTimeline from "./ThreatDecisionTimeline";
import { loadUserRiskPolicy, saveUserRiskPolicy } from "../lib/policy/userRiskPolicy.js";

function getSafeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export default function PolicyDashboard() {
  const [policy, setPolicy] = useState(() => loadUserRiskPolicy({}, getSafeLocalStorage()));
  const [draft, setDraft] = useState(policy.allowList.join("\n"));
  const [blocked, setBlocked] = useState(policy.blockList.join("\n"));
  const [riskThreshold, setRiskThreshold] = useState(policy.riskThreshold);
  const [warnThreshold, setWarnThreshold] = useState(policy.warnThreshold);

  const summary = useMemo(() => {
    return {
      allowCount: policy.allowList.length,
      blockCount: policy.blockList.length,
      status: policy.riskThreshold >= 80 ? "Strict" : policy.riskThreshold >= 60 ? "Balanced" : "Lenient",
    };
  }, [policy]);

  const statusTone = summary.status === "Strict" ? "score-risky" : summary.status === "Balanced" ? "score-caution" : "score-trusted";

  const save = () => {
    const nextPolicy = {
      allowList: draft.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean),
      blockList: blocked.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean),
      riskThreshold: Number(riskThreshold),
      warnThreshold: Number(warnThreshold),
    };

    const normalized = saveUserRiskPolicy(nextPolicy, getSafeLocalStorage());
    setPolicy(normalized);
  };

  return (
    <section className="security-panel policy-panel" aria-label="User policy dashboard">
      <div className="panel-header policy-header">
        <div className="policy-header-copy">
          <span className="eyebrow">User policy</span>
          <h3>Trusted site controls</h3>
        </div>
        <span className={`score-pill ${statusTone}`}>{summary.status}</span>
      </div>

      <div className="policy-summary-grid">
        <div className="mini-stat mini-stat-success">
          <div className="mini-stat-icon"><ShieldCheck size={16} /></div>
          <div>
            <strong>{summary.allowCount}</strong>
            <small>Allow listed</small>
          </div>
        </div>
        <div className="mini-stat mini-stat-danger">
          <div className="mini-stat-icon"><ShieldX size={16} /></div>
          <div>
            <strong>{summary.blockCount}</strong>
            <small>Blocked</small>
          </div>
        </div>
        <div className="mini-stat mini-stat-warning">
          <div className="mini-stat-icon"><ShieldAlert size={16} /></div>
          <div>
            <strong>{riskThreshold}%</strong>
            <small>Block threshold</small>
          </div>
        </div>
      </div>

      <div className="policy-grid">
        <label className="field-block policy-field">
          <span className="field-label"><ShieldCheck size={14} /> Trusted domains</span>
          <textarea className="policy-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} />
        </label>

        <label className="field-block policy-field">
          <span className="field-label"><ShieldX size={14} /> Blocked domains</span>
          <textarea className="policy-textarea" value={blocked} onChange={(event) => setBlocked(event.target.value)} rows={6} />
        </label>
      </div>

      <div className="policy-range-grid">
        <label className="field-block range-field">
          <span className="field-label">Block threshold: {riskThreshold}%</span>
          <input className="policy-range" type="range" min="20" max="95" value={riskThreshold} onChange={(event) => setRiskThreshold(Number(event.target.value))} />
          <div className="range-scale"><span>20%</span><span>95%</span></div>
        </label>

        <label className="field-block range-field">
          <span className="field-label">Warn threshold: {warnThreshold}%</span>
          <input className="policy-range" type="range" min="5" max="70" value={warnThreshold} onChange={(event) => setWarnThreshold(Number(event.target.value))} />
          <div className="range-scale"><span>5%</span><span>70%</span></div>
        </label>
      </div>

      <div className="policy-actions">
        <button type="button" className="button-primary" onClick={save}>Save policy</button>
      </div>

      <ThreatDecisionTimeline />
    </section>
  );
}
