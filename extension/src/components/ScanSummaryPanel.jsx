export function ScanSummaryPanel({ downloadScans, cookieScans, extensionScans, passwordScans }) {
  const latestDownload = downloadScans?.[0] ?? null;
  const latestCookie = cookieScans?.[0] ?? null;
  const latestExtension = extensionScans?.[0] ?? null;
  const latestPassword = passwordScans?.[0] ?? null;

  return (
    <section className="scan-summary-panel">
      <h3>Recent security scans</h3>
      <div className="scan-summary-grid">
        <article className="scan-card">
          <h4>Download scan</h4>
          <p>{latestDownload ? `Risk ${Math.round(latestDownload.risk * 100)}%` : "No downloads scanned"}</p>
          <p>{latestDownload?.filename ?? "—"}</p>
        </article>
        <article className="scan-card">
          <h4>Cookie scan</h4>
          <p>{latestCookie ? `Risk ${Math.round(latestCookie.risk * 100)}%` : "No cookie scan"}</p>
          <p>{latestCookie?.domain ?? "—"}</p>
        </article>
        <article className="scan-card">
          <h4>Extension scan</h4>
          <p>{latestExtension ? `Risk ${Math.round(latestExtension.risk * 100)}%` : "No extension scan"}</p>
          <p>{latestExtension ? `${latestExtension.extensionCount} extensions` : "—"}</p>
        </article>
        <article className="scan-card">
          <h4>Password scan</h4>
          <p>{latestPassword ? `Strength ${Math.round(latestPassword.strength * 100)}%` : "No password scan"}</p>
          <p>{latestPassword ? (latestPassword.reuseDetected ? "Reuse detected" : "No reuse") : "—"}</p>
        </article>
      </div>
    </section>
  );
}
