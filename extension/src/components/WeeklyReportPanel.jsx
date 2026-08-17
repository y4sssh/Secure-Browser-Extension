export function WeeklyReportPanel({ report }) {
  if (!report) {
    return (
      <section className="weekly-report-panel">
        <h3>Weekly report</h3>
        <p>No weekly report available yet.</p>
      </section>
    );
  }

  const scans = report.scans || {};

  return (
    <section className="weekly-report-panel">
      <h3>Weekly report</h3>
      <p>{report.summary}</p>
      <div className="weekly-report-grid">
        <div>
          <strong>Pages analyzed</strong>
          <p>{report.pageAnalysisCount ?? 0}</p>
        </div>
        <div>
          <strong>High-risk pages</strong>
          <p>{report.verdictCounts?.high_risk ?? 0}</p>
        </div>
      </div>

      {report.alerts?.length ? (
        <div style={{ marginTop: 12 }}>
          <strong>Alerts</strong>
          <ul>
            {report.alerts.map((alert, index) => (
              <li key={index} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{alert.verdict?.replace(/_/g, " ") || "unknown"}</strong> — {alert.url || "unknown page"}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  {(alert.reasons || []).slice(0, 2).join(" • ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.topDomains?.length ? (
        <div style={{ marginTop: 12 }}>
          <strong>Top risky domains</strong>
          <ul>
            {report.topDomains.map((domain) => (
              <li key={domain.hostname}>
                {domain.hostname} ({domain.count})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scans.downloads?.length ? (
        <div style={{ marginTop: 12 }}>
          <strong>Risky downloads</strong>
          <ul>
            {scans.downloads.map((scan, index) => (
              <li key={scan.id || index}>
                {scan.filename || "unknown"} — Risk {Math.round((scan.risk ?? 0) * 100)}%
                <div style={{ fontSize: 12, color: "#555" }}>
                  {(scan.reasons || []).slice(0, 2).join(" • ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scans.cookies?.length ? (
        <div style={{ marginTop: 12 }}>
          <strong>Cookie issues</strong>
          <ul>
            {scans.cookies.map((scan, index) => (
              <li key={scan.domain || index}>
                {scan.domain || "unknown"} — {scan.cookieCount ?? 0} cookies, Risk {Math.round((scan.risk ?? 0) * 100)}%
                <div style={{ fontSize: 12, color: "#555" }}>
                  {(scan.reasons || []).slice(0, 2).join(" • ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scans.extensions?.length ? (
        <div style={{ marginTop: 12 }}>
          <strong>Extension risks</strong>
          <ul>
            {scans.extensions.map((scan, index) => (
              <li key={scan.timestamp || index}>
                {scan.extensionCount ?? 0} extensions — Risk {Math.round((scan.risk ?? 0) * 100)}%
                <div style={{ fontSize: 12, color: "#555" }}>
                  {(scan.reasons || []).slice(0, 2).join(" • ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.recommendations?.length ? (
        <div style={{ marginTop: 12 }}>
          <strong>Recommended actions</strong>
          <ul>
            {report.recommendations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
