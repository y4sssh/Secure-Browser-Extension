import { useState } from "react";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import { sendRuntimeMessage } from "../lib/chrome/runtime";

const PERMISSION_EXPLANATIONS = {
  cookies: "Inspect cookie security flags. Cookie values are never stored or sent.",
  management: "List installed extensions and their permissions. No extension data is sent externally.",
};

export function ScanSummaryPanel({ downloadScans, cookieScans, extensionScans, passwordScans }) {
  const [cookieLoading, setCookieLoading] = useState(false);
  const [cookiePermissionLoading, setCookiePermissionLoading] = useState(false);
  const [cookiePermissionMessage, setCookiePermissionMessage] = useState(null);
  const [cookieScanMessage, setCookieScanMessage] = useState(null);

  const latestDownload = downloadScans?.[0] ?? null;
  const latestCookie = cookieScans?.[0] ?? null;
  const latestExtension = extensionScans?.[0] ?? null;
  const [extLoading, setExtLoading] = useState(false);
  const [extPermissionLoading, setExtPermissionLoading] = useState(false);
  const latestPassword = passwordScans?.[0] ?? null;

  return (
    <section className="scan-summary-panel">
      <h3>Recent security scans</h3>
      <p style={{ marginTop: 4, marginBottom: 12, color: "#657282", fontSize: 12 }}>
        Scans run locally in your browser. Optional permissions are requested only when you start a scan.
      </p>
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
                setCookieScanMessage(null);
                try {
                  const resp = await sendRuntimeMessage({ type: MESSAGE_TYPES.RUN_COOKIE_SCAN });
                  setCookieLoading(false);
                  if (!resp?.ok) {
                    setCookieScanMessage(`Cookie scan failed: ${resp?.error || "unknown"}`);
                  } else if (resp.scan) {
                    setCookieScanMessage("Cookie scan completed.");
                  } else {
                    setCookieScanMessage("Cookie scan completed (no data returned).");
                  }
                } catch (err) {
                  setCookieLoading(false);
                  setCookieScanMessage(`Cookie scan error: ${err?.message || err}`);
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
                setCookiePermissionMessage(null);
                try {
                  const resp = await sendRuntimeMessage({ type: MESSAGE_TYPES.REQUEST_COOKIE_PERMISSION });
                  setCookiePermissionLoading(false);
                  if (!resp?.ok) {
                    setCookiePermissionMessage(`Permission request failed: ${resp?.error || "unknown"}`);
                  } else if (resp.granted) {
                    setCookiePermissionMessage("Cookie permission granted.");
                  } else {
                    setCookiePermissionMessage("Cookie permission not granted by the user.");
                  }
                } catch (err) {
                  setCookiePermissionLoading(false);
                  setCookiePermissionMessage(`Permission request error: ${err?.message || err}`);
                }
              }}
              style={{ marginLeft: 8 }}
            >
              {cookiePermissionLoading ? "Requesting…" : "Enable cookie permission"}
            </button>

            <p style={{ marginTop: 6, color: "#657282", fontSize: 11 }}>{PERMISSION_EXPLANATIONS.cookies}</p>
            {cookiePermissionMessage ? (
              <p style={{ marginTop: 6, color: cookiePermissionMessage.includes("granted") ? "#006400" : "#a94442", fontSize: 12 }}>
                {cookiePermissionMessage}
              </p>
            ) : null}
            {cookieScanMessage ? (
              <p style={{ marginTop: 6, color: cookieScanMessage.includes("failed") ? "#a94442" : "#006400", fontSize: 12 }}>
                {cookieScanMessage}
              </p>
            ) : null}
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
            <p style={{ marginTop: 6, color: "#657282", fontSize: 11 }}>{PERMISSION_EXPLANATIONS.management}</p>
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
