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
    <section className="security-panel" aria-label="User policy dashboard">
      <div className="panel-header">
        <div>
          <span className="eyebrow">User policy</span>
          <h3>Trusted site controls</h3>
        </div>
        <span className={`pill ${summary.status.toLowerCase()}`}>{summary.status}</span>
      </div>

      <div className="policy-summary-grid">
        <div className="mini-stat">
          <ShieldCheck size={16} />
          <div>
            <strong>{summary.allowCount}</strong>
            <small>Allow listed</small>
          </div>
        </div>
        <div className="mini-stat">
          <ShieldX size={16} />
          <div>
            <strong>{summary.blockCount}</strong>
            <small>Blocked</small>
          </div>
        </div>
        <div className="mini-stat">
          <ShieldAlert size={16} />
          <div>
            <strong>{riskThreshold}%</strong>
            <small>Block threshold</small>
          </div>
        </div>
      </div>

      <div className="policy-grid">
        <label className="field-block">
          <span>Trusted domains</span>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} />
        </label>

        <label className="field-block">
          <span>Blocked domains</span>
          <textarea value={blocked} onChange={(event) => setBlocked(event.target.value)} rows={6} />
        </label>
      </div>

      <div className="policy-range-grid">
        <label className="field-block">
          <span>Block threshold: {riskThreshold}%</span>
          <input type="range" min="20" max="95" value={riskThreshold} onChange={(event) => setRiskThreshold(Number(event.target.value))} />
        </label>

        <label className="field-block">
          <span>Warn threshold: {warnThreshold}%</span>
          <input type="range" min="5" max="70" value={warnThreshold} onChange={(event) => setWarnThreshold(Number(event.target.value))} />
        </label>
      </div>

      <button type="button" className="button-primary" onClick={save}>Save policy</button>

      <ThreatDecisionTimeline />
    </section>
  );
}
