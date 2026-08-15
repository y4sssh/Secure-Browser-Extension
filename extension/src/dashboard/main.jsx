import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { AlertBanner } from "../components/AlertBanner";
import { BrandGuardSummary } from "../components/BrandGuardSummary";
import { EvidenceReasons } from "../components/EvidenceReasons";
import { FormGuardTimeline } from "../components/FormGuardTimeline";
import { ScanSummaryPanel } from "../components/ScanSummaryPanel";
import CookieHealthPanel from "../components/CookieHealthPanel";
import ExtensionHealthPanel from "../components/ExtensionHealthPanel";
import { WeeklyReportPanel } from "../components/WeeklyReportPanel";
import { SignalGrid } from "../components/SignalGrid";
import { TrustMeter } from "../components/TrustMeter";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import { sendRuntimeMessage } from "../lib/chrome/runtime";
import { formatTimestamp, getPrimaryScore, getTrustLabel } from "../lib/evidence/evidenceSummary";
import "../styles/global.css";

function DashboardApp() {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [downloadScans, setDownloadScans] = useState([]);
  const [cookieScans, setCookieScans] = useState([]);
  const [extensionScans, setExtensionScans] = useState([]);
  const [passwordScans, setPasswordScans] = useState([]);
  const [weeklyReport, setWeeklyReport] = useState(null);

  const loadRecentEvidence = useCallback(async () => {
    setLoading(true);
    const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.GET_RECENT_EVIDENCE });
    setEvidence(response?.ok ? response.evidence ?? [] : []);
    setStatus(response?.ok ? "" : response?.error ?? "Unable to read stored evidence.");
    setLoading(false);
  }, []);

  const loadScanSummaries = useCallback(async () => {
    const [downloads, cookies, extensions, passwords, report] = await Promise.all([
      sendRuntimeMessage({ type: MESSAGE_TYPES.GET_LATEST_DOWNLOAD_SCANS }),
      sendRuntimeMessage({ type: MESSAGE_TYPES.GET_LATEST_COOKIE_SCANS }),
      sendRuntimeMessage({ type: MESSAGE_TYPES.GET_LATEST_EXTENSION_SCANS }),
      sendRuntimeMessage({ type: MESSAGE_TYPES.GET_LATEST_PASSWORD_SCANS }),
      sendRuntimeMessage({ type: MESSAGE_TYPES.GET_WEEKLY_REPORT }),
    ]);

    setDownloadScans(downloads?.ok ? downloads.scans ?? [] : []);
    setCookieScans(cookies?.ok ? cookies.scans ?? [] : []);
    setExtensionScans(extensions?.ok ? extensions.scans ?? [] : []);
    setPasswordScans(passwords?.ok ? passwords.scans ?? [] : []);
    setWeeklyReport(report?.ok ? report : null);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRecentEvidence(), loadScanSummaries()]);
    setLoading(false);
  }, [loadRecentEvidence, loadScanSummaries]);

  useEffect(() => {
    loadRecentEvidence();
    loadScanSummaries();
  }, [loadRecentEvidence, loadScanSummaries]);

  const latest = evidence[0] ?? null;
  const score = getPrimaryScore(latest);
  const counts = useMemo(
    () => ({
      total: evidence.length,
      caution: evidence.filter((item) => getPrimaryScore(item) < 80 && getPrimaryScore(item) >= 50).length,
      risky: evidence.filter((item) => getPrimaryScore(item) < 50).length,
    }),
    [evidence],
  );

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <h1>Secure Browser Dashboard</h1>
            <p>Recent page evidence</p>
          </div>
        </div>
        <button className="button-primary" type="button" onClick={refreshAll}>
          <RefreshCw size={17} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {latest ? (
        <section className="dashboard-overview">
          <TrustMeter score={score} />
          <dl className="summary-strip">
            <div>
              <dt>Stored scans</dt>
              <dd>{counts.total}</dd>
            </div>
            <div>
              <dt>Caution</dt>
              <dd>{counts.caution}</dd>
            </div>
            <div>
              <dt>Risky</dt>
              <dd>{counts.risky}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {loading ? <div className="empty-state">Loading evidence</div> : null}
      {status ? <p className="status-line">{status}</p> : null}

      {latest ? <AlertBanner score={score} verdict={latest.verdict} reasons={latest.reasons} /> : null}
      <ScanSummaryPanel
        downloadScans={downloadScans}
        cookieScans={cookieScans}
        extensionScans={extensionScans}
        passwordScans={passwordScans}
      />
      <CookieHealthPanel cookieScans={cookieScans} />
      <ExtensionHealthPanel extensionScans={extensionScans} />
      <WeeklyReportPanel report={weeklyReport} />

      {!loading && evidence.length === 0 ? (
        <div className="empty-state">No page evidence stored</div>
      ) : (
        <section className="evidence-list" aria-label="Recent page evidence">
          {evidence.map((item) => {
            const itemScore = getPrimaryScore(item);

            return (
              <article className="evidence-card" key={item.id}>
                <div className="evidence-card-header">
                  <div>
                    <h2>{item.hostname || "Unknown page"}</h2>
                    <p>{item.url}</p>
                  </div>
                  <span className={`score-pill score-${getTrustLabel(itemScore).toLowerCase().replace(" ", "-")}`}>
                    {itemScore} {getTrustLabel(itemScore)}
                  </span>
                </div>
                <SignalGrid evidence={item} />
                <BrandGuardSummary evidence={item} />
                <EvidenceReasons reasons={item.reasons} />
                <FormGuardTimeline timeline={item.formGuard?.timeline ?? item.timeline} />
                <div className="meta-row">
                  <span>{formatTimestamp(item.timestamp)}</span>
                  <span>{item.trigger}</span>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>,
);
