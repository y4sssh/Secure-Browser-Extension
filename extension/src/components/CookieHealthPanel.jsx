import React from "react";

export function CookieHealthPanel({ cookieScans = [] }) {
  if (!Array.isArray(cookieScans) || cookieScans.length === 0) {
    return (
      <section className="cookie-health-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">Privacy signal</span>
            <h3>Cookie health</h3>
          </div>
        </div>
        <div className="empty-panel-state">No cookie scans available</div>
      </section>
    );
  }

  return (
    <section className="cookie-health-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Privacy signal</span>
          <h3>Cookie health</h3>
        </div>
        <span className="panel-count">{cookieScans.length} site{cookieScans.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="cookie-list">
        {cookieScans.map((scan) => (
          <article key={scan.timestamp + scan.domain} className="cookie-scan-card">
            <div className="cookie-scan-header">
              <div>
                <h4>{scan.domain || "Unknown domain"}</h4>
                <span className="mini-label">Session and cookie posture</span>
              </div>
              <span className={`risk-badge risk-${(scan.risk ?? 0) >= 0.5 ? "high" : (scan.risk ?? 0) >= 0.2 ? "medium" : "low"}`}>
                Risk {Math.round((scan.risk ?? 0) * 100)}%
              </span>
            </div>

            <p className="cookie-scan-reasons">{(scan.reasons || []).slice(0, 3).join(" • ") || "No notable cookie risk signals"}</p>

            <details className="detail-list">
              <summary>Cookies (hashed names & flags)</summary>
              <ul className="detail-list-items">
                {(scan.cookies || []).map((c) => (
                  <li key={c.nameHash}>
                    <strong>{c.nameHash.slice(0, 12)}</strong>
                    <span>{`domain: ${c.domain || "-"}`}</span>
                    <span>{`secure: ${c.secure ? "yes" : "no"}`}</span>
                    <span>{`httpOnly: ${c.httpOnly ? "yes" : "no"}`}</span>
                    <span>{`sameSite: ${c.sameSite || "-"}`}</span>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

export default CookieHealthPanel;
