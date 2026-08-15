import { useState } from "react";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import { sendRuntimeMessage } from "../lib/chrome/runtime";

export function ScanSummaryPanel({ downloadScans, cookieScans, extensionScans, passwordScans }) {
  const [cookieLoading, setCookieLoading] = useState(false);
  const [cookiePermissionLoading, setCookiePermissionLoading] = useState(false);

  const latestDownload = downloadScans?.[0] ?? null;
  const latestCookie = cookieScans?.[0] ?? null;
  const latestExtension = extensionScans?.[0] ?? null;
  const [extLoading, setExtLoading] = useState(false);
  const [extPermissionLoading, setExtPermissionLoading] = useState(false);
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
          <div style={{ marginTop: 8 }}>
            <button
              className="button-secondary"
              type="button"
              onClick={async () => {
                setCookieLoading(true);
                const resp = await sendRuntimeMessage({ type: MESSAGE_TYPES.RUN_COOKIE_SCAN });
                setCookieLoading(false);
                if (!resp?.ok) {
                  // ignore — the dashboard refresh will show status
                }
              }}
            >
              {cookieLoading ? "Scanning…" : "Run cookie scan"}
            </button>
            <button
              className="button-link"
              type="button"
              onClick={async () => {
                setCookiePermissionLoading(true);
                const resp = await sendRuntimeMessage({ type: MESSAGE_TYPES.REQUEST_COOKIE_PERMISSION });
                setCookiePermissionLoading(false);
                if (!resp?.ok) {
                  // ignore
                }
              }}
              style={{ marginLeft: 8 }}
            >
              {cookiePermissionLoading ? "Requesting…" : "Enable cookie permission"}
            </button>
          </div>
        </article>
        <article className="scan-card">
          <h4>Extension scan</h4>
          <p>{latestExtension ? `Risk ${Math.round(latestExtension.risk * 100)}%` : "No extension scan"}</p>
          <p>{latestExtension ? `${latestExtension.extensionCount} extensions` : "—"}</p>
          <div style={{ marginTop: 8 }}>
            <button
              className="button-secondary"
              type="button"
              onClick={async () => {
                setExtLoading(true);
                const resp = await sendRuntimeMessage({ type: MESSAGE_TYPES.RUN_EXTENSION_SCAN });
                setExtLoading(false);
                if (!resp?.ok) {
                  // ignore
                }
              }}
            >
              {extLoading ? "Scanning…" : "Run extension scan"}
            </button>
            <button
              className="button-link"
              type="button"
              onClick={async () => {
                setExtPermissionLoading(true);
                const resp = await sendRuntimeMessage({ type: MESSAGE_TYPES.REQUEST_MANAGEMENT_PERMISSION });
                setExtPermissionLoading(false);
                if (!resp?.ok) {
                  // ignore
                }
              }}
              style={{ marginLeft: 8 }}
            >
              {extPermissionLoading ? "Requesting…" : "Enable management permission"}
            </button>
          </div>
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
