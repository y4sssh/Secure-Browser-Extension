import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { FileSearch, Home, LockKeyhole, RefreshCw, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
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
import PolicyDashboard from "../components/PolicyDashboard";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import { sendRuntimeMessage } from "../lib/chrome/runtime";
import { formatTimestamp, getPrimaryScore, getTrustLabel } from "../lib/evidence/evidenceSummary";
import { askSecurityAssistant } from "../lib/securityAssistant";
import "../styles/global.css";

const WORKSPACE_META = {
  Overview: { eyebrow: "Command center", title: "Browser security, at a glance", description: "A privacy-first view of the signals Secure Browser is actively monitoring." },
  Threats: { eyebrow: "Threat workspace", title: "Prioritize what needs attention", description: "Review local browser, extension, cookie, download, and credential-risk signals." },
  Evidence: { eyebrow: "Evidence vault", title: "Searchable scan history", description: "Inspect privacy-safe evidence from recent page assessments." },
  Policies: { eyebrow: "Security controls", title: "Tailor your protection posture", description: "Configure trust overrides and the thresholds used for warnings and blocking." },
  Privacy: { eyebrow: "Privacy center", title: "You control every optional signal", description: "Review how each capability uses data and enable it only when you choose." },
};

function WorkspaceHero({ section, children }) {
  const meta = WORKSPACE_META[section];
  return (
    <section className="workspace-hero">
      <div>
        <span className="eyebrow">{meta.eyebrow}</span>
        <h2>{meta.title}</h2>
        <p>{meta.description}</p>
      </div>
      {children ? <div className="workspace-hero-actions">{children}</div> : null}
    </section>
  );
}

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
  const drawerMode = useMemo(() => new URLSearchParams(globalThis.location?.search ?? "").get("source") === "toolbar", []);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedSection, setSelectedSection] = useState(drawerMode ? "Threats" : "Overview");
  const [downloadScans, setDownloadScans] = useState([]);
  const [cookieScans, setCookieScans] = useState([]);
  const [extensionScans, setExtensionScans] = useState([]);
  const [passwordScans, setPasswordScans] = useState([]);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const [evidenceFilter, setEvidenceFilter] = useState("all");

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
    const onChanged = storage?.onChanged;
    if (!onChanged || typeof onChanged.addListener !== "function") return undefined;

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

    onChanged.addListener(handleStorageChange);
    return () => {
      if (typeof onChanged.removeListener === "function") {
        onChanged.removeListener(handleStorageChange);
      }
    };
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

  const filteredEvidence = useMemo(() => {
    const query = evidenceQuery.trim().toLowerCase();
    return evidence.filter((item) => {
      const itemScore = getPrimaryScore(item);
      const matchesFilter = evidenceFilter === "all"
        || (evidenceFilter === "risky" && itemScore < 50)
        || (evidenceFilter === "caution" && itemScore >= 50 && itemScore < 80)
        || (evidenceFilter === "trusted" && itemScore >= 80);
      const searchable = [item.hostname, item.url, item.verdict, ...(item.reasons || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!query || searchable.includes(query));
    });
  }, [evidence, evidenceFilter, evidenceQuery]);

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

  const threatPriorityActions = useMemo(() => {
    const actions = [];

    if (latest && score < 50) {
      actions.push({
        title: "Isolate the current page",
        detail: "High-risk policy suggests you should close or review the page before entering credentials.",
        severity: "critical",
      });
    }

    if ((cookieScans?.[0]?.risk ?? 0) > 0.35) {
      actions.push({
        title: "Review cookie posture",
        detail: "Sensitive cookies are showing elevated risk and should be reviewed before completing any session.",
        severity: "warning",
      });
    }

    if ((extensionScans?.[0]?.risk ?? 0) > 0.4) {
      actions.push({
        title: "Audit installed extensions",
        detail: "The extension footprint includes broad access patterns and should be checked for unnecessary permissions.",
        severity: "warning",
      });
    }

    if (latest?.reasons?.some((reason) => /brand|impersonat|phish|redirect/i.test(String(reason)))) {
      actions.push({
        title: "Verify site identity",
        detail: "Brand mismatch or deceptive redirect signals are active and deserve a trust check before interacting.",
        severity: "critical",
      });
    }

    if (!actions.length) {
      actions.push({
        title: "Monitor in place",
        detail: "No immediate remediation is required. Continue monitoring and keep the current policy in effect.",
        severity: "safe",
      });
    }

    return actions.slice(0, 3);
  }, [cookieScans, extensionScans, latest, score]);

  const threatActivityFeed = useMemo(() => {
    return evidence.slice(0, 5).map((item) => {
      const itemScore = getPrimaryScore(item);
      const severity = itemScore < 50 ? "critical" : itemScore < 80 ? "warning" : "safe";
      return {
        title: item.hostname || "Unknown host",
        time: formatTimestamp(item.timestamp),
        message: item.reasons?.[0] || item.verdict || "Scan recorded",
        severity,
      };
    });
  }, [evidence]);

  const navItems = [
    { label: "Overview", Icon: Home },
    { label: "Threats", Icon: ShieldAlert },
    { label: "Evidence", Icon: FileSearch },
    { label: "Policies", Icon: SlidersHorizontal },
    { label: "Privacy", Icon: LockKeyhole },
  ];
  const quickActions = [
    { label: "Review threat", action: () => setSelectedSection("Threats") },
    { label: "Policy controls", action: () => setSelectedSection("Policies") },
    { label: "Privacy", action: () => setSelectedSection("Privacy") },
  ];

  const drawerSummary = useMemo(() => ({
    riskScore: latest ? Math.max(0, Math.min(100, Math.round(100 - score))) : 0,
    hostname: latest?.hostname || latest?.url || "Awaiting active scan",
    reasons: latest?.reasons ? latest.reasons.slice(0, 3) : ["No active threat signals detected."],
  }), [latest, score]);

  const overviewSection = (
    <div className="dashboard-section">
      <WorkspaceHero section="Overview">
        <span className="workspace-stat"><strong>{counts.total}</strong> scans retained</span>
        <span className="workspace-stat is-secure"><i /> Protection active</span>
      </WorkspaceHero>
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

  const overallThreatScore = latest ? Math.max(0, 100 - score) : 0;
  const threatSummaryBars = [
    { label: "Page", value: Math.min(100, Math.round((latest?.scores?.urlRisk ?? 0) * 100)), tone: "danger" },
    { label: "Form", value: Math.min(100, Math.round((latest?.scores?.formRisk ?? 0) * 100)), tone: "amber" },
    { label: "Brand", value: Math.min(100, Math.round((latest?.scores?.brandRisk ?? 0) * 100)), tone: "purple" },
    { label: "Cookie", value: Math.min(100, Math.round((cookieScans?.[0]?.risk ?? 0) * 100)), tone: "cyan" },
    { label: "Ext", value: Math.min(100, Math.round((extensionScans?.[0]?.risk ?? 0) * 100)), tone: "danger" },
  ];

  const threatsSection = (
    <div className="dashboard-section">
      <WorkspaceHero section="Threats">
        <span className="workspace-stat is-risk"><strong>{counts.risky}</strong> high-risk events</span>
        <button className="button-secondary workspace-action" type="button" onClick={() => { setEvidenceFilter("risky"); setSelectedSection("Evidence"); }}>
          Review risky evidence
        </button>
      </WorkspaceHero>

      <section className="threat-summary-header" aria-label="Threat summary">
        <div className="threat-summary-copy">
          <span className="eyebrow">Risk posture</span>
          <h2>{latest ? `${overallThreatScore}% active threat score` : "Awaiting page analysis"}</h2>
          <p>{latest ? latest.reasons?.[0] || "No priority risk note yet." : "No current scan data is available for this view."}</p>
        </div>

        <div className="threat-summary-metrics" aria-label="Threat metrics">
          <div className="metric-tile is-danger">
            <span>Critical</span>
            <strong>{counts.risky}</strong>
          </div>
          <div className="metric-tile is-warning">
            <span>Needs review</span>
            <strong>{counts.caution}</strong>
          </div>
          <div className="metric-tile is-safe">
            <span>Trusted</span>
            <strong>{counts.trusted ?? 0}</strong>
          </div>
        </div>

        <div className="threat-mini-chart" aria-label="Threat category mini chart">
          {threatSummaryBars.map((item) => (
            <div key={item.label} className="mini-chart-item">
              <div className="mini-chart-label-row">
                <span>{item.label}</span>
                <strong>{item.value}%</strong>
              </div>
              <div className="mini-chart-track">
                <span className={`mini-chart-fill tone-${item.tone}`} style={{ width: `${item.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="threat-priority-strip" aria-label="Priority actions and timelines">
        <div className="priority-actions-panel">
          <div className="panel-header compact">
            <div>
              <span className="panel-kicker">Priority</span>
              <h3>Recommended actions</h3>
            </div>
          </div>
          <ul className="priority-actions-list">
            {threatPriorityActions.map((action) => (
              <li key={action.title} className={`priority-action severity-${action.severity}`}>
                <div className="priority-bullet" aria-hidden="true" />
                <div>
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="timeline-panel">
          <div className="panel-header compact">
            <div>
              <span className="panel-kicker">Activity</span>
              <h3>Threat timeline</h3>
            </div>
          </div>
          <ul className="threat-timeline">
            {threatActivityFeed.map((entry) => (
              <li key={`${entry.title}-${entry.time}`} className={`timeline-entry severity-${entry.severity}`}>
                <div className="timeline-dot" aria-hidden="true" />
                <div className="timeline-copy">
                  <div className="timeline-header">
                    <strong>{entry.title}</strong>
                    <time>{entry.time}</time>
                  </div>
                  <p>{entry.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
      <WorkspaceHero section="Evidence">
        <span className="workspace-stat"><strong>{filteredEvidence.length}</strong> matching scans</span>
      </WorkspaceHero>
      <section className="evidence-toolbar" aria-label="Evidence filters">
        <label className="evidence-search">
          <Search size={16} aria-hidden="true" />
          <input value={evidenceQuery} onChange={(event) => setEvidenceQuery(event.target.value)} placeholder="Search domain, verdict, or signal" />
          {evidenceQuery ? <button type="button" title="Clear search" onClick={() => setEvidenceQuery("")}><X size={14} aria-hidden="true" /></button> : null}
        </label>
        <div className="evidence-filter-group" role="group" aria-label="Filter evidence by severity">
          {["all", "risky", "caution", "trusted"].map((filter) => (
            <button key={filter} type="button" className={evidenceFilter === filter ? "active" : ""} onClick={() => setEvidenceFilter(filter)}>
              {filter === "all" ? "All" : filter}
            </button>
          ))}
        </div>
      </section>
      {!loading && evidence.length === 0 ? (
        <div className="empty-state">No page evidence stored</div>
      ) : !loading && filteredEvidence.length === 0 ? (
        <div className="empty-state">No stored scans match these filters</div>
      ) : (
        <section className="evidence-list" aria-label="Recent page evidence">
          {filteredEvidence.map((item) => {
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

  const policiesSection = (
    <div className="dashboard-section">
      <WorkspaceHero section="Policies" />
      <PolicyDashboard />
    </div>
  );

  const privacySection = (
    <div className="dashboard-section">
      <WorkspaceHero section="Privacy">
        <span className="workspace-stat is-secure"><i /> Consent-based by default</span>
      </WorkspaceHero>
      <PrivacyNotice />
      <ConsentPanel />
    </div>
  );

  return (
    <main className={`dashboard-shell${drawerMode ? " toolbar-drawer" : ""}`}>
      <div className="security-shell">
        <aside className={`security-sidebar${drawerMode ? " toolbar-sidebar" : ""}`} aria-label="Security navigation">
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
            {navItems.map(({ label, Icon }) => (
              <button
                key={label}
                className={`nav-button${selectedSection === label ? " active" : ""}`}
                type="button"
                onClick={() => setSelectedSection(label)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {drawerMode && (
            <>
              <div className="drawer-summary" aria-live="polite">
                <div className="drawer-summary-top">
                  <span className="eyebrow">Alert snapshot</span>
                  <strong>{drawerSummary.riskScore}%</strong>
                </div>
                <p className="drawer-summary-host">{drawerSummary.hostname}</p>
                <ul className="drawer-summary-list">
                  {drawerSummary.reasons.map((reason, index) => (
                    <li key={`${reason}-${index}`}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="drawer-actions" aria-label="Quick actions">
                {quickActions.map(({ label, action }) => (
                  <button key={label} type="button" className="drawer-action" onClick={action}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="sidebar-card">
            <span className="eyebrow">Current status</span>
            <strong>{latest ? getTrustLabel(score) : "No scan"}</strong>
            <small>{latest ? `${score}/100 trust score` : "Awaiting data"}</small>
          </div>
        </aside>

        <section className="main-panel">
          <header className={`dashboard-header${drawerMode ? " toolbar-header" : ""}`}>
            <div className="brand-lockup">
              <ShieldCheck size={24} aria-hidden="true" />
              <div>
                <h1>{drawerMode ? "Security drawer" : "Security dashboard"}</h1>
                <p>{selectedSection} view</p>
              </div>
            </div>
            <div className="dashboard-header-actions">
              <span className={`header-protection-state${loading ? " is-loading" : ""}`}>
                <i aria-hidden="true" />
                {loading ? "Updating" : "Protection active"}
              </span>
              <button className="button-primary" type="button" onClick={refreshAll} disabled={loading}>
                <RefreshCw size={17} aria-hidden="true" />
                Refresh
              </button>
            </div>
          </header>

          {selectedSection === "Overview" && overviewSection}
          {selectedSection === "Threats" && threatsSection}
          {selectedSection === "Evidence" && evidenceSection}
          {selectedSection === "Policies" && policiesSection}
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
