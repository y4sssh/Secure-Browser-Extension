import React from "react";

export function CookieHealthPanel({ cookieScans = [] }) {
  if (!Array.isArray(cookieScans) || cookieScans.length === 0) {
    return (
      <section className="cookie-health-panel">
        <h3>Cookie health</h3>
        <div>No cookie scans available</div>
      </section>
    );
  }

  return (
    <section className="cookie-health-panel">
      <h3>Cookie health</h3>
      <div className="cookie-list">
        {cookieScans.map((scan) => (
          <article key={scan.timestamp + scan.domain} className="cookie-scan-card">
            <div className="cookie-scan-header">
              <h4>{scan.domain || "Unknown domain"}</h4>
              <span>{`Risk ${Math.round((scan.risk ?? 0) * 100)}%`}</span>
            </div>
            <p className="cookie-scan-reasons">{(scan.reasons || []).slice(0, 3).join(" • ")}</p>
            <details>
              <summary>Cookies (hashed names & flags)</summary>
              <ul>
                {(scan.cookies || []).map((c) => (
                  <li key={c.nameHash}>
                    <strong>{c.nameHash.slice(0, 12)}</strong>
                    {` — domain: ${c.domain || "-"}, secure: ${c.secure ? "yes" : "no"}, httpOnly: ${c.httpOnly ? "yes" : "no"}, sameSite: ${c.sameSite || "-"}`}
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
