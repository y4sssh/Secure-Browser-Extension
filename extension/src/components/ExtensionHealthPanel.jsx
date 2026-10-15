import React from "react";

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

export function ExtensionHealthPanel({ extensionScans = [] }) {
  const deduplicatedScans = React.useMemo(() => deduplicateExtensionScans(extensionScans), [extensionScans]);

  if (!Array.isArray(deduplicatedScans) || deduplicatedScans.length === 0) {
    return (
      <section className="extension-health-panel">
        <h3>Extension exposure</h3>
        <div>No extension scans available</div>
      </section>
    );
  }
  const latest = deduplicatedScans?.[0] ?? null;

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
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Installed software</span>
          <h3>Extension exposure</h3>
        </div>
        <span className="panel-count">{deduplicatedScans.length} scan{deduplicatedScans.length !== 1 ? "s" : ""}</span>
      </div>

      <p className="panel-note">
        <strong>Note:</strong> This panel shows exposure analysis based on installed extensions and their permissions. It is not proof that an extension is exfiltrating data.
      </p>

      {riskyPermEntries.length > 0 ? (
        <div className="permission-summary">
          <h4>Risky permissions observed</h4>
          <ul className="permission-list">
            {riskyPermEntries.map(([perm, count]) => (
              <li key={perm}>
                <span className="perm-name">{perm}</span>
                <span className="perm-copy">{PERMISSION_EXPLANATIONS[perm]}</span>
                <span className="perm-meta">({count} extension{count !== 1 ? "s" : ""})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="extension-list">
        {deduplicatedScans.map((scan) => (
          <article key={`${scan.timestamp}-${scan.extensionCount}-${(scan.extensions || []).map((ext) => ext.id).join("|")}`} className="extension-scan-card">
            <div className="extension-scan-header">
              <div>
                <h4>{`Extensions: ${scan.extensionCount || 0}`}</h4>
                <span className="mini-label">Permission footprint</span>
              </div>
              <span className={`risk-badge risk-${(scan.risk ?? 0) >= 0.5 ? "high" : (scan.risk ?? 0) >= 0.2 ? "medium" : "low"}`}>
                Risk {Math.round((scan.risk ?? 0) * 100)}%
              </span>
            </div>

            <p className="extension-scan-reasons">{(scan.reasons || []).slice(0, 3).join(" • ") || "No notable extension exposure risks"}</p>

            <details className="detail-list">
              <summary>Installed extensions (exposure details)</summary>
              <ul className="detail-list-items extension-detail-items">
                {(scan.extensions || []).map((ext) => (
                  <li key={ext.id}>
                    <div className="extension-item-head">
                      <strong>{ext.name}</strong>
                      <span className="extension-id">id: {ext.id.slice(0, 12)}</span>
                      {(ext.installType === "development" || ext.installType === "sideload") && (
                        <span className="status-pill warning">Sideloaded / Dev</span>
                      )}
                      {!ext.enabled && <span className="status-pill muted">disabled</span>}
                    </div>
                    <div className="extension-meta">install: {ext.installType || "-"}, enabled: {ext.enabled ? "yes" : "no"}</div>
                    <div className="extension-meta"><em>Permissions:</em> {(ext.permissions || []).join(", ") || "none"}</div>
                    <div className="extension-meta"><em>Host permissions:</em> {(ext.hostPermissions || []).slice(0, 4).join(", ") || "none"}</div>
                    <div className="extension-item-foot">
                      <span>Risk: {Math.round((ext.risk ?? 0) * 100)}%</span>
                      <small>{(ext.reasons || []).slice(0, 2).join(" • ") || "No specific concern"}</small>
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
