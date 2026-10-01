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
import { ChatBotPanel } from "../components/ChatBotPanel";
import ExposureMap from "../components/ExposureMap";
import { WeeklyReportPanel } from "../components/WeeklyReportPanel";
import { SignalGrid } from "../components/SignalGrid";
import { TrustMeter } from "../components/TrustMeter";
import PrivacyNotice from "../components/PrivacyNotice";
import ConsentPanel from "../components/ConsentPanel";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import { sendRuntimeMessage } from "../lib/chrome/runtime";
import { formatTimestamp, getPrimaryScore, getTrustLabel } from "../lib/evidence/evidenceSummary";
import { askSecurityAssistant } from "../lib/securityAssistant";
import "../styles/global.css";

function deduplicateExtensionScans(scans) {
  const seen = new Map();

  for (const scan of Array.isArray(scans) ? scans : []) {
    const signature = JSON.stringify({
      extensionCount: Number(scan?.extensionCount ?? 0),
      risk: Number(scan?.risk ?? 0),
      reasons: Array.isArray(scan?.reasons) ? [...scan.reasons].sort() : [],
      extensions: Array.isArray(scan?.extensions)
        ? [...scan.extensions].map((ext) => ({
            id: ext?.id ?? "",
            name: ext?.name ?? "",
            enabled: Boolean(ext?.enabled),
            installType: ext?.installType ?? "",
            version: ext?.version ?? "",
            permissions: Array.isArray(ext?.permissions) ? [...ext.permissions].sort() : [],
            hostPermissions: Array.isArray(ext?.hostPermissions) ? [...ext.hostPermissions].sort() : [],
            risk: Number(ext?.risk ?? 0),
          })).sort((left, right) => String(left.id).localeCompare(String(right.id)))
        : [],
    });

    if (!seen.has(signature)) {
      seen.set(signature, scan);
    }
  }

  return Array.from(seen.values());
}

function DashboardApp() {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedSection, setSelectedSection] = useState("Overview");
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
    setExtensionScans(extensions?.ok ? deduplicateExtensionScans(extensions.scans ?? []) : []);
    setPasswordScans(passwords?.ok ? passwords.scans ?? [] : []);
    setWeeklyReport(report?.ok ? report : null);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRecentEvidence(), loadScanSummaries()]);
    setLoading(false);
  }, [loadRecentEvidence, loadScanSummaries]);

  const handleChatAsk = useCallback(async (question, evidence) => {
    return askSecurityAssistant(question, evidence);
  }, []);

  const handleCookieScan = useCallback((scan) => {
    setCookieScans((previous) => [scan, ...previous.filter((item) => item.domain !== scan.domain)].slice(0, 30));
  }, []);

  const handleExtensionScan = useCallback((scan) => {
    setExtensionScans((previous) => deduplicateExtensionScans([scan, ...previous]).slice(0, 30));
  }, []);

  useEffect(() => {
    loadRecentEvidence();
    loadScanSummaries();
  }, [loadRecentEvidence, loadScanSummaries]);

  useEffect(() => {
    const storage = globalThis.chrome?.storage;
    if (!storage?.onChanged) return undefined;

    const scanKeys = new Set([
      "secureBrowser.downloadScans",
      "secureBrowser.cookieScans",
      "secureBrowser.extensionScans",
      "secureBrowser.passwordScans",
    ]);
    const handleStorageChange = (changes, areaName) => {
      if (areaName === "local" && Object.keys(changes).some((key) => scanKeys.has(key))) {
        void loadScanSummaries();
      }
    };

    storage.onChanged.addListener(handleStorageChange);
    return () => storage.onChanged.removeListener(handleStorageChange);
  }, [loadScanSummaries]);

  const latest = evidence[0] ?? null;
  const score = getPrimaryScore(latest);
  const trendSeries = useMemo(() => {
    const items = Array.isArray(evidence) ? evidence.slice(0, 12) : [];
    if (items.length === 0) {
      return Array.from({ length: 8 }, (_, index) => 72 - index * 6 + (index % 3) * 4);
    }

    return items
      .map((item) => {
        const itemScore = getPrimaryScore(item);
        return Math.max(0, Math.min(100, 100 - itemScore));
      })
      .reverse();
  }, [evidence]);

  const counts = useMemo(
    () => ({
      total: evidence.length,
      caution: evidence.filter((item) => getPrimaryScore(item) < 80 && getPrimaryScore(item) >= 50).length,
      risky: evidence.filter((item) => getPrimaryScore(item) < 50).length,
    }),
    [evidence],
  );

  const historicalTrend = useMemo(() => {
    const points = Array.from({ length: 7 }, (_, index) => {
      const base = evidence[Math.min(index, Math.max(evidence.length - 1, 0))];
      const scoreValue = base ? getPrimaryScore(base) : 86 - index * 6;
      return {
        label: `S${index + 1}`,
        score: 100 - Math.max(0, Math.min(100, scoreValue)),
        phishing: 30 + index * 6 + (index % 2 === 0 ? 8 : 0),
        cookies: 18 + index * 5 + (index % 3) * 4,
        downloads: 16 + index * 7,
        extensions: 20 + index * 4 + (index % 2 === 0 ? 10 : 0),
      };
    });

    return points.length ? points : Array.from({ length: 7 }, (_, index) => ({
      label: `S${index + 1}`,
      score: 24 + index * 7,
      phishing: 18 + index * 5,
      cookies: 12 + index * 6,
      downloads: 14 + index * 4,
      extensions: 22 + index * 5,
    }));
  }, [evidence]);

  const categoryBreakdown = useMemo(() => {
    const source = [
      { label: "Phishing", value: latest ? Math.max(10, Math.min(92, 42 + (latest.reasons?.length ?? 0) * 7)) : 28, color: "#7cc6ff" },
      { label: "Cookies", value: latest ? Math.max(8, Math.min(90, 24 + (counts.total || 0) * 12)) : 18, color: "#5fe0a9" },
      { label: "Downloads", value: latest ? Math.max(12, Math.min(88, 18 + (counts.risky || 0) * 18)) : 12, color: "#ffc857" },
      { label: "Extensions", value: latest ? Math.max(10, Math.min(96, 30 + (counts.caution || 0) * 16)) : 21, color: "#ff767b" },
    ];

    return source.map((item) => ({
      ...item,
      value: Math.min(100, Math.max(8, Math.round(item.value))),
    }));
  }, [counts, latest]);

  const riskLevelClass = latest ? `severity-${getTrustLabel(score).toLowerCase().replace(/\s+/g, "-")}` : "severity-idle";

  const navItems = ["Overview", "Threats", "Evidence", "Privacy"];

  const overviewSection = (
    <div className="dashboard-section">
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

      <section className="analytics-panel" aria-label="Threat trend overview">
        <div className="analytics-header">
          <div>
            <span className="eyebrow">Threat trend</span>
            <strong>Live risk signal</strong>
          </div>
          <div className="analytics-header-meta">
            <span className="status-live">Live</span>
            <span className="signal-timestamp">
              {latest ? `Updated ${formatTimestamp(latest.timestamp)}` : "Awaiting signal"}
            </span>
          </div>
        </div>

        <div className="telemetry-grid">
          <div className="historical-trend-panel">
            <div className="chart-header-row">
              <span className="eyebrow">Historical trend</span>
              <span className="chart-caption">7-scan activity</span>
            </div>

            <svg className="trend-chart" viewBox="0 0 420 180" preserveAspectRatio="none" role="img" aria-label="Historical risk trend chart">
              <defs>
                <linearGradient id="trendGradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#7cc6ff" />
                  <stop offset="45%" stopColor="#5fe0a9" />
                  <stop offset="100%" stopColor="#ffbd50" />
                </linearGradient>
                <linearGradient id="secondaryGradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#8b9afc" />
                  <stop offset="100%" stopColor="#67d3ff" />
                </linearGradient>
              </defs>

              {[0, 25, 50, 75, 100].map((tick) => (
                <line key={tick} x1="0" x2="420" y1={170 - tick * 1.3} y2={170 - tick * 1.3} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
              ))}

              {[1, 2, 3, 4, 5, 6, 7].map((point) => (
                <line key={point} x1={point * 58} x2={point * 58} y1="20" y2="170" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
              ))}

              <polyline
                fill="none"
                stroke="url(#trendGradient)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={historicalTrend
                  .map((point, index) => `${index * 58 + 20},${170 - point.score * 1.3}`)
                  .join(" ")}
              >
                {historicalTrend.map((point, index) => (
                  <title key={`${point.label}-title`}>{`${point.label}: ${point.score}% risk`}</title>
                ))}
              </polyline>

              <polyline
                fill="none"
                stroke="url(#secondaryGradient)"
                strokeWidth="2"
                opacity="0.8"
                strokeDasharray="7 7"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={historicalTrend
                  .map((point, index) => `${index * 58 + 20},${170 - point.phishing * 1.15}`)
                  .join(" ")}
              />

              {historicalTrend.map((point, index) => (
                <g key={point.label}>
                  <circle cx={index * 58 + 20} cy={170 - point.score * 1.3} r="4" fill="#7cc6ff" stroke="#0f172a" strokeWidth="2">
                    <title>{`${point.label}: composite risk ${point.score}%`}</title>
                  </circle>
                </g>
              ))}
            </svg>

            <div className="chart-legend">
              <span><i className="legend-swatch primary" /> Composite</span>
              <span><i className="legend-swatch secondary" /> Phishing</span>
            </div>
          </div>

          <div className="telemetry-side-panel">
            <div className="panel-subhead">Category breakdown</div>
            {categoryBreakdown.map((item) => (
              <div className="breakdown-row" key={item.label}>
                <div className="breakdown-header">
                  <span className="category-label"><i className="category-dot" style={{ background: item.color }} />{item.label}</span>
                  <strong>{item.value}%</strong>
                </div>
                <div className="breakdown-track">
                  <span style={{ width: `${item.value}%`, background: item.color }} />
                </div>
              </div>
            ))}

            <div className="severity-block">
              <div className="panel-subhead">Severity legend</div>
              <div className="legend-scale">
                <span><i className="legend-scale-dot low" /> Low 0-39</span>
                <span><i className="legend-scale-dot medium" /> Moderate 40-69</span>
                <span><i className="legend-scale-dot high" /> High 70-100</span>
              </div>
            </div>
          </div>
        </div>

        <div className="trend-metrics">
          <div className="metric-mini">
            <span>Threat score</span>
            <strong>{Math.round(100 - score)}%</strong>
          </div>
          <div className="metric-mini">
            <span>Risk pulse</span>
            <strong>{Math.max(1, Math.round((trendSeries.at(-1) ?? 45) / 5) * 5)}%</strong>
          </div>
          <div className={`metric-mini ${riskLevelClass}`}>
            <span>Threat state</span>
            <strong>{latest ? getTrustLabel(score) : "Idle"}</strong>
          </div>
        </div>

        <div className="analytics-details">
          <div className="detail-item">
            <span className="detail-label">Detection confidence</span>
            <strong>{Math.min(99, 72 + (latest?.reasons?.length ?? 0) * 6)}%</strong>
            <small>{latest?.reasons?.length ?? 0} active signals</small>
          </div>
          <div className="detail-item">
            <span className="detail-label">Exposure count</span>
            <strong>{counts.risky}</strong>
            <small>High-risk events</small>
          </div>
          <div className="detail-item">
            <span className="detail-label">Scan coverage</span>
            <strong>{counts.total}</strong>
            <small>Tracked observations</small>
          </div>
          <div className="detail-item">
            <span className="detail-label">Caution level</span>
            <strong>{counts.caution}</strong>
            <small>Needs review</small>
          </div>
        </div>
      </section>

      {loading ? <div className="empty-state">Loading evidence</div> : null}
      {status ? <p className="status-line">{status}</p> : null}

      {latest ? <AlertBanner score={score} verdict={latest.verdict} reasons={latest.reasons} /> : null}
      <ScanSummaryPanel
        downloadScans={downloadScans}
        cookieScans={cookieScans}
        extensionScans={extensionScans}
        passwordScans={passwordScans}
        onCookieScan={handleCookieScan}
        onExtensionScan={handleExtensionScan}
      />
      <ChatBotPanel latestEvidence={latest} onAsk={handleChatAsk} />
    </div>
  );

  const threatsSection = (
    <div className="dashboard-section">
      {latest ? <AlertBanner score={score} verdict={latest.verdict} reasons={latest.reasons} /> : null}
      <ScanSummaryPanel
        downloadScans={downloadScans}
        cookieScans={cookieScans}
        extensionScans={extensionScans}
        passwordScans={passwordScans}
        onCookieScan={handleCookieScan}
        onExtensionScan={handleExtensionScan}
      />
      <CookieHealthPanel cookieScans={cookieScans} />
      <ExtensionHealthPanel extensionScans={extensionScans} />
      <ExposureMap extensionScans={extensionScans} />
      <WeeklyReportPanel report={weeklyReport} />
    </div>
  );

  const evidenceSection = (
    <div className="dashboard-section">
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
    </div>
  );

  const privacySection = (
    <div className="dashboard-section">
      <PrivacyNotice />
      <ConsentPanel />
    </div>
  );

  return (
    <main className="dashboard-shell">
      <div className="security-shell">
        <aside className="security-sidebar" aria-label="Security navigation">
          <div className="sidebar-brand">
            <div className="brand-mark">
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            <div>
              <strong>Secure Browser</strong>
              <span>Threat Center</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <button
                key={item}
                className={`nav-button${selectedSection === item ? " active" : ""}`}
                type="button"
                onClick={() => setSelectedSection(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="sidebar-card">
            <span className="eyebrow">Current status</span>
            <strong>{latest ? getTrustLabel(score) : "No scan"}</strong>
            <small>{latest ? `${score}/100 trust score` : "Awaiting data"}</small>
          </div>
        </aside>

        <section className="main-panel">
          <header className="dashboard-header">
            <div className="brand-lockup">
              <ShieldCheck size={24} aria-hidden="true" />
              <div>
                <h1>Security dashboard</h1>
                <p>{selectedSection} view</p>
              </div>
            </div>
            <button className="button-primary" type="button" onClick={refreshAll}>
              <RefreshCw size={17} aria-hidden="true" />
              Refresh
            </button>
          </header>

          {selectedSection === "Overview" && overviewSection}
          {selectedSection === "Threats" && threatsSection}
          {selectedSection === "Evidence" && evidenceSection}
          {selectedSection === "Privacy" && privacySection}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>,
);
