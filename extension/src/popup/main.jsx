import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, LayoutDashboard, RefreshCw } from "lucide-react";
import { EvidenceReasons } from "../components/EvidenceReasons";
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
import "../styles/global.css";

function PopupApp() {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadLatestEvidence = useCallback(async () => {
    setLoading(true);
    const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.GET_LATEST_EVIDENCE });
    setEvidence(response?.ok ? response.evidence : null);
    setStatus(response?.ok ? "" : response?.error ?? "Unable to read stored evidence.");
    setLoading(false);
  }, []);

  const refreshActivePage = useCallback(async () => {
    setStatus("Scanning active tab");
    const tab = await queryActiveTab();

    if (tab?.id) {
      await sendTabMessage(tab.id, { type: MESSAGE_TYPES.REQUEST_PAGE_SCAN });
      window.setTimeout(loadLatestEvidence, 300);
      return;
    }

    await loadLatestEvidence();
  }, [loadLatestEvidence]);

  useEffect(() => {
    loadLatestEvidence();
  }, [loadLatestEvidence]);

  const score = getPrimaryScore(evidence);

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <h1>Secure Browser</h1>
          <p>{evidence?.origin ?? "No page scan stored"}</p>
        </div>
        <button className="icon-button" type="button" onClick={refreshActivePage} title="Scan active tab">
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>

      {loading ? (
        <div className="empty-state">Loading scan</div>
      ) : evidence ? (
        <>
          <TrustMeter score={score} />
          <SignalGrid evidence={evidence} />
          <EvidenceReasons reasons={evidence.reasons} />
          <div className="meta-row">
            <span>{formatTimestamp(evidence.timestamp)}</span>
            <span>{evidence.trigger}</span>
          </div>
        </>
      ) : (
        <div className="empty-state">No scan available</div>
      )}

      {status ? <p className="status-line">{status}</p> : null}

      <footer className="popup-actions">
        <button className="button-secondary" type="button" onClick={() => openExtensionPage("dashboard.html")}>
          <LayoutDashboard size={17} aria-hidden="true" />
          Dashboard
        </button>
        <a className="button-secondary" href={evidence?.url ?? "#"} target="_blank" rel="noreferrer">
          <ExternalLink size={17} aria-hidden="true" />
          Page
        </a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
