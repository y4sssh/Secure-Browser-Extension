import React, { useMemo } from "react";

export function ExposureMap({ extensionScans = [] }) {
  const latest = extensionScans?.[0] ?? null;

  const map = useMemo(() => {
    const hostMap = {}; // hostPattern -> { count, extensions: [name] }
    if (!latest || !Array.isArray(latest.extensions)) return { hostMap: {}, totalExtensions: 0 };

    for (const ext of latest.extensions) {
      const hosts = Array.isArray(ext.hostPermissions) ? ext.hostPermissions : [];
      for (const h of hosts) {
        const key = String(h).trim();
        if (!key) continue;
        if (!hostMap[key]) hostMap[key] = { count: 0, extensions: [] };
        hostMap[key].count += 1;
        hostMap[key].extensions.push(ext.name || ext.id || "unknown");
      }
    }

    return { hostMap, totalExtensions: latest.extensionCount || (latest.extensions || []).length };
  }, [latest]);

  const entries = useMemo(() => Object.entries(map.hostMap).sort((a, b) => b[1].count - a[1].count), [map]);

  if (!latest || entries.length === 0) {
    return (
      <section className="exposure-map-panel">
        <h3>Extension exposure map</h3>
        <div>No host exposure data available</div>
      </section>
    );
  }

  return (
    <section className="exposure-map-panel">
      <h3>Extension exposure map</h3>
      <p style={{ marginTop: 4, marginBottom: 8 }}>Extensions scanned: {map.totalExtensions}</p>
      <div className="exposure-list">
        {entries.slice(0, 40).map(([host, info]) => (
          <article key={host} className="exposure-item" style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13 }}>{host}</strong>
              <span style={{ color: "#666" }}>{info.count} extension{info.count !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
              {info.extensions.slice(0, 6).join(", ")}
              {info.extensions.length > 6 ? ` and ${info.extensions.length - 6} more` : ""}
            </div>
          </article>
        ))}
      </div>
      {entries.length > 40 ? <div style={{ marginTop: 8, color: "#666" }}>Showing top 40 host patterns</div> : null}
    </section>
  );
}

export default ExposureMap;
