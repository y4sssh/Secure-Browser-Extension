export function WeeklyReportPanel({ report }) {
  if (!report) {
    return (
      <section className="weekly-report-panel">
        <h3>Weekly report</h3>
        <p>No weekly report available yet.</p>
      </section>
    );
  }

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
      {report.topDomains?.length ? (
        <div>
          <strong>Top domains</strong>
          <ul>
            {report.topDomains.map((domain) => (
              <li key={domain.hostname}>
                {domain.hostname} ({domain.count})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.topRisks?.length ? (
        <div>
          <strong>Top risks</strong>
          <ul>
            {report.topRisks.map((risk) => (
              <li key={risk.reason}>
                {risk.reason} ({risk.count})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
