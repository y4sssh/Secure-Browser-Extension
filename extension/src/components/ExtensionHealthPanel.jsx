import React from "react";

export function ExtensionHealthPanel({ extensionScans = [] }) {
  if (!Array.isArray(extensionScans) || extensionScans.length === 0) {
    return (
      <section className="extension-health-panel">
        <h3>Extension exposure</h3>
        <div>No extension scans available</div>
      </section>
    );
  }

  return (
    <section className="extension-health-panel">
      <h3>Extension exposure</h3>
      <div className="extension-list">
        {extensionScans.map((scan) => (
          <article key={scan.timestamp} className="extension-scan-card">
            <div className="extension-scan-header">
              <h4>{`Extensions: ${scan.extensionCount || 0}`}</h4>
              <span>{`Risk ${Math.round((scan.risk ?? 0) * 100)}%`}</span>
            </div>
            <p className="extension-scan-reasons">{(scan.reasons || []).slice(0, 3).join(" • ")}</p>
            <details>
              <summary>Installed extensions (exposure details)</summary>
              <ul>
                {(scan.extensions || []).map((ext) => (
                  <li key={ext.id} style={{ marginBottom: 8 }}>
                    <strong>{ext.name}</strong>
                    {` — id: ${ext.id.slice(0, 12)}, enabled: ${ext.enabled ? "yes" : "no"}, install: ${ext.installType || "-"}`}
                    <div style={{ marginTop: 6 }}>
                      <em>Permissions:</em> {(ext.permissions || []).join(", ") || "none"}
                    </div>
                    <div>
                      <em>Host permissions:</em> {(ext.hostPermissions || []).slice(0, 4).join(", ") || "none"}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span>Risk: {Math.round((ext.risk ?? 0) * 100)}%</span>
                      <div style={{ fontSize: 12, color: "#555" }}>{(ext.reasons || []).slice(0, 2).join(" • ")}</div>
                    </div>
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

export default ExtensionHealthPanel;
