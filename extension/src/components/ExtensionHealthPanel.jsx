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
  const latest = extensionScans?.[0] ?? null;

  // Explanation map for sensitive permissions
  const PERMISSION_EXPLANATIONS = {
    webRequest: "Can observe and modify network requests made by the browser.",
    webRequestBlocking: "Can block or modify network requests before they complete.",
    cookies: "Can read and modify cookies for sites the extension has access to.",
    nativeMessaging: "Can communicate with native apps installed on your machine.",
    history: "Can read your browsing history.",
    management: "Can query and manage other installed extensions.",
    scripting: "Can inject and execute scripts in pages the extension can access.",
    downloads: "Can monitor and modify downloads.",
    clipboardRead: "Can read clipboard contents when active.",
    clipboardWrite: "Can write to the clipboard.",
    tabs: "Can see open tabs and their URLs.",
  };

  // Aggregate permission counts across the latest scan
  const permCount = {};
  if (latest && Array.isArray(latest.extensions)) {
    for (const ext of latest.extensions) {
      const perms = Array.isArray(ext.permissions) ? ext.permissions : [];
      for (const p of perms) {
        permCount[p] = (permCount[p] || 0) + 1;
      }
    }
  }

  const riskyPermEntries = Object.entries(permCount)
    .filter(([perm]) => PERMISSION_EXPLANATIONS[perm])
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="extension-health-panel">
      <h3>Extension exposure</h3>
      <p style={{ marginTop: 6, marginBottom: 10, color: "#333" }}>
        <strong>Note:</strong> This panel shows exposure analysis based on installed extensions and their permissions. It is not proof that an extension is exfiltrating data.
      </p>
      {riskyPermEntries.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <h4 style={{ margin: "6px 0" }}>Risky permissions observed</h4>
          <ul style={{ marginTop: 6 }}>
            {riskyPermEntries.map(([perm, count]) => (
              <li key={perm} style={{ marginBottom: 4 }}>
                <strong>{perm}</strong> — {PERMISSION_EXPLANATIONS[perm]} ({count} extension{count !== 1 ? "s" : ""})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>{ext.name}</strong>
                      <span style={{ color: "#666", fontSize: 12 }}>{`id: ${ext.id.slice(0, 12)}`}</span>
                      {ext.installType === "development" || ext.installType === "sideload" ? (
                        <span style={{ marginLeft: 8, padding: "2px 6px", background: "#ffe8e6", color: "#a33", borderRadius: 6, fontSize: 12 }}>Sideloaded / Dev</span>
                      ) : null}
                      {!ext.enabled ? <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>disabled</span> : null}
                    </div>
                    <div style={{ marginTop: 6 }}>{`install: ${ext.installType || "-"}, enabled: ${ext.enabled ? "yes" : "no"}`}</div>
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
