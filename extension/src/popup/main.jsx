import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ExternalLink, LayoutDashboard, RefreshCw, ScanSearch, ShieldCheck } from "lucide-react";
import { AlertBanner } from "../components/AlertBanner";
import { BrandGuardSummary } from "../components/BrandGuardSummary";
import { EvidenceReasons } from "../components/EvidenceReasons";
import { FormGuardTimeline } from "../components/FormGuardTimeline";
import { SignalGrid } from "../components/SignalGrid";
import { TrustMeter } from "../components/TrustMeter";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import {
  openExtensionPage,
  queryActiveTab,
  sendRuntimeMessage,
  sendTabMessage,
} from "../lib/chrome/runtime";
import { formatTimestamp, getPrimaryScore } from "../lib/evidence/evidenceSummary";
import { ensureLatestPageScan } from "./scanBootstrap";
import "../styles/global.css";

function PopupApp() {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadLatestEvidence = useCallback(async () => {
    setLoading(true);

    const scanResult = await ensureLatestPageScan({
      readLatestEvidence: async () => {
        const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.GET_LATEST_EVIDENCE });
        if (!response?.ok) {
          setStatus(response?.error ?? "Unable to read stored evidence.");
          return null;
        }

        return response.evidence ?? null;
      },
      queryActiveTab,
      sendTabMessage,
      setStatus,
    });

    setEvidence(scanResult.evidence ?? null);
    setStatus(scanResult.error || "");
    setLoading(false);
  }, []);

  const refreshActivePage = useCallback(async () => {
    setStatus("Scanning active tab");
    setLoading(true);
    const tab = await queryActiveTab();

    if (tab?.id) {
      const response = await sendTabMessage(tab.id, { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN });
      if (!response?.ok) {
        setStatus(response?.error || "Unable to scan the active tab.");
        setLoading(false);
        return;
      }
      window.setTimeout(loadLatestEvidence, 300);
      return;
    }

    await loadLatestEvidence();
  }, [loadLatestEvidence]);

  useEffect(() => {
    loadLatestEvidence();
  }, [loadLatestEvidence]);

  const score = getPrimaryScore(evidence);
  const hostname = evidence?.hostname || evidence?.origin?.replace(/^https?:\/\//, "") || "Active tab";
  const protectionLabel = loading ? "Scanning" : evidence ? "Assessment ready" : "Ready to scan";

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="popup-brand-block">
          <div className="popup-brand-mark"><ShieldCheck size={19} aria-hidden="true" /></div>
          <div>
            <h1>Secure Browser</h1>
            <p>Private threat intelligence</p>
          </div>
        </div>
        <button className={`icon-button${loading ? " is-spinning" : ""}`} type="button" onClick={refreshActivePage} title="Scan active tab" disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>

      <section className="popup-context" aria-label="Active protection status">
        <span className={`protection-dot${loading ? " is-scanning" : ""}`} aria-hidden="true" />
        <span>{protectionLabel}</span>
        <strong title={hostname}>{hostname}</strong>
      </section>

      {loading ? (
        <div className="popup-loading" aria-live="polite">
          <Activity size={20} aria-hidden="true" />
          <div><strong>Checking this page</strong><span>Analyzing visible security signals</span></div>
        </div>
      ) : evidence ? (
        <>
          <AlertBanner score={score} verdict={evidence.verdict} reasons={evidence.reasons} />
          <TrustMeter score={score} />
          <div className="popup-section-heading"><span>Key signals</span><small>Latest scan</small></div>
          <SignalGrid evidence={evidence} compact />
          <BrandGuardSummary evidence={evidence} />
          <EvidenceReasons reasons={evidence.reasons} />
          <FormGuardTimeline timeline={evidence.formGuard?.timeline ?? evidence.timeline} />
          <div className="meta-row">
            <span>{formatTimestamp(evidence.timestamp)}</span>
            <span>{evidence.trigger}</span>
          </div>
        </>
      ) : (
        <div className="popup-empty-state">
          <div><ScanSearch size={26} aria-hidden="true" /></div>
          <strong>Scan the page you are viewing</strong>
          <p>We inspect risk signals locally and do not store page text or credentials.</p>
        </div>
      )}

      {status ? <p className="status-line">{status}</p> : null}

      <button className="popup-scan-button" type="button" onClick={refreshActivePage} disabled={loading}>
        <ScanSearch size={17} aria-hidden="true" />
        {loading ? "Scanning active page" : "Scan active page"}
      </button>

      <footer className="popup-actions">
        <button className="button-secondary" type="button" onClick={() => openExtensionPage("dashboard.html")}>
          <LayoutDashboard size={17} aria-hidden="true" />
          Dashboard
        </button>
        {evidence?.url ? (
          <a className="button-secondary" href={evidence.url} target="_blank" rel="noreferrer">
            <ExternalLink size={17} aria-hidden="true" />
            Open page
          </a>
        ) : <span className="button-secondary is-disabled">Page unavailable</span>}
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
