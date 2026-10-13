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

  const allowList = useMemo(() => draft.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean), [draft]);
  const blockList = useMemo(() => blocked.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean), [blocked]);

  const summary = useMemo(() => {
    return {
      allowCount: policy.allowList.length,
      blockCount: policy.blockList.length,
      status: policy.riskThreshold >= 80 ? "Strict" : policy.riskThreshold >= 60 ? "Balanced" : "Lenient",
    };
  }, [policy]);

  const statusTone = summary.status === "Strict" ? "score-risky" : summary.status === "Balanced" ? "score-caution" : "score-trusted";

  const validation = useMemo(() => {
    const normalizedAllow = allowList.filter((entry) => !entry.includes(" ") && /^[a-z0-9.-]+$/i.test(entry));
    const invalidAllow = allowList.length - normalizedAllow.length;
    const invalidBlock = blockList.filter((entry) => entry.includes(" ") || !/^[a-z0-9.-]+$/i.test(entry)).length;
    const duplicateAllow = allowList.filter((entry, index, values) => values.indexOf(entry) !== index).length;
    const duplicateBlock = blockList.filter((entry, index, values) => values.indexOf(entry) !== index).length;

    return {
      invalidAllow,
      invalidBlock,
      duplicateAllow,
      duplicateBlock,
      hasIssues: invalidAllow > 0 || invalidBlock > 0 || duplicateAllow > 0 || duplicateBlock > 0 || riskThreshold <= warnThreshold,
    };
  }, [allowList, blockList, riskThreshold, warnThreshold]);

  const save = () => {
    const nextPolicy = {
      allowList: allowList,
      blockList: blockList,
      riskThreshold: Number(riskThreshold),
      warnThreshold: Number(warnThreshold),
    };

    const normalized = saveUserRiskPolicy(nextPolicy, getSafeLocalStorage());
    setPolicy(normalized);
  };

  const applyProfile = (profile) => {
    if (profile === "strict") {
      setRiskThreshold(80);
      setWarnThreshold(35);
      return;
    }
    if (profile === "balanced") {
      setRiskThreshold(70);
      setWarnThreshold(25);
      return;
    }
    setRiskThreshold(55);
    setWarnThreshold(15);
  };

  const resetDefaults = () => {
    const defaults = loadUserRiskPolicy({}, getSafeLocalStorage());
    setDraft(defaults.allowList.join("\n"));
    setBlocked(defaults.blockList.join("\n"));
    setRiskThreshold(defaults.riskThreshold);
    setWarnThreshold(defaults.warnThreshold);
  };

  return (
    <section className="security-panel policy-panel" aria-label="User policy dashboard">
      <div className="panel-header policy-header">
        <div className="policy-header-copy">
          <span className="eyebrow">User policy</span>
          <h3>Trusted site controls</h3>
          <p>Adaptive risk thresholds and manual trust overrides for browser protection.</p>
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

      <div className="policy-profile-grid">
        <div className="profile-card">
          <span className="field-label">Policy profile</span>
          <div className="policy-profile-buttons">
            <button type="button" className="profile-button" onClick={() => applyProfile("lenient")}>Lenient</button>
            <button type="button" className="profile-button active" onClick={() => applyProfile("balanced")}>Balanced</button>
            <button type="button" className="profile-button" onClick={() => applyProfile("strict")}>Strict</button>
          </div>
        </div>

        <div className="profile-card">
          <span className="field-label">Policy health</span>
          <div className={`policy-status ${validation.hasIssues ? "warning" : "healthy"}`}>
            {validation.hasIssues ? "Review recommended" : "Healthy and active"}
          </div>
        </div>
      </div>

      {validation.hasIssues && (
        <div className="policy-validation">
          {validation.invalidAllow > 0 && <span>Trusted list includes invalid entries</span>}
          {validation.invalidBlock > 0 && <span>Blocked list includes invalid entries</span>}
          {validation.duplicateAllow > 0 && <span>Duplicate trusted domains detected</span>}
          {validation.duplicateBlock > 0 && <span>Duplicate blocked domains detected</span>}
          {riskThreshold <= warnThreshold && <span>Block threshold should be above warn threshold</span>}
        </div>
      )}

      <div className="policy-grid">
        <label className="field-block policy-field">
          <span className="field-label"><ShieldCheck size={14} /> Trusted domains</span>
          <textarea className="policy-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} />
          <div className="chip-list">
            {allowList.length === 0 ? <span className="chip empty">No trusted domains</span> : allowList.slice(0, 8).map((entry) => <span key={`allow-${entry}`} className="chip approved">{entry}</span>)}
          </div>
        </label>

        <label className="field-block policy-field">
          <span className="field-label"><ShieldX size={14} /> Blocked domains</span>
          <textarea className="policy-textarea" value={blocked} onChange={(event) => setBlocked(event.target.value)} rows={6} />
          <div className="chip-list">
            {blockList.length === 0 ? <span className="chip empty">No blocked domains</span> : blockList.slice(0, 8).map((entry) => <span key={`block-${entry}`} className="chip blocked">{entry}</span>)}
          </div>
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
        <button type="button" className="button-secondary policy-ghost" onClick={resetDefaults}>Reset defaults</button>
        <button type="button" className="button-primary" onClick={save}>Save policy</button>
      </div>

      <ThreatDecisionTimeline />
    </section>
  );
}
