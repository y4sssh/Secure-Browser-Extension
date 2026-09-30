import { useCallback, useEffect, useState } from "react";
import { MESSAGE_TYPES } from "../lib/chrome/messageTypes";
import {
  hasOptionalPermission,
  requestOptionalPermission,
  sendRuntimeMessage,
} from "../lib/chrome/runtime";

const PERMISSION_EXPLANATIONS = {
  cookies: "Inspect cookie security flags. Cookie values are never stored or sent.",
  management: "List installed extensions and their permissions. No extension data is sent externally.",
};

function messageStyle(message) {
  if (!message) return "#657282";
  return message.kind === "error" ? "#a94442" : "#006400";
}

export function ScanSummaryPanel({
  downloadScans,
  cookieScans,
  extensionScans,
  passwordScans,
  onCookieScan,
  onExtensionScan,
}) {
  const [cookieLoading, setCookieLoading] = useState(false);
  const [cookiePermissionLoading, setCookiePermissionLoading] = useState(false);
  const [cookiePermissionMessage, setCookiePermissionMessage] = useState(null);
  const [cookieScanMessage, setCookieScanMessage] = useState(null);
  const [extLoading, setExtLoading] = useState(false);
  const [extPermissionLoading, setExtPermissionLoading] = useState(false);
  const [extPermissionMessage, setExtPermissionMessage] = useState(null);
  const [extScanMessage, setExtScanMessage] = useState(null);
  const [managementGranted, setManagementGranted] = useState(null);

  const latestDownload = downloadScans?.[0] ?? null;
  const latestCookie = cookieScans?.[0] ?? null;
  const latestExtension = extensionScans?.[0] ?? null;
  const latestPassword = passwordScans?.[0] ?? null;

  const refreshManagementPermission = useCallback(async () => {
    setManagementGranted(await hasOptionalPermission("management"));
  }, []);

  useEffect(() => {
    void refreshManagementPermission();
  }, [refreshManagementPermission]);

  const enableManagementPermission = async () => {
    setExtPermissionLoading(true);
    setExtPermissionMessage(null);
    // This starts directly from the clicked page so Chrome can associate the
    // optional-permission request with a user gesture.
    const result = await requestOptionalPermission("management");
    setExtPermissionLoading(false);
    setManagementGranted(result.granted);
    setExtPermissionMessage(
      result.granted
        ? { kind: "success", text: "Management permission granted. You can now scan installed extensions." }
        : { kind: "error", text: result.error || "Management permission was not granted. No extension data was read." },
    );
    return result.granted;
  };

  const runExtensionScan = async () => {
    setExtLoading(true);
    setExtScanMessage(null);
    try {
      let granted = managementGranted;
      if (granted !== true) {
        // Invoke request before the first await to preserve Chrome's required
        // user-gesture context, then wait for the user's decision.
        const permissionRequest = requestOptionalPermission("management");
        setExtPermissionLoading(true);
        const permissionResult = await permissionRequest;
        setExtPermissionLoading(false);
        granted = permissionResult.granted;
        setManagementGranted(granted);
        setExtPermissionMessage(
          granted
            ? { kind: "success", text: "Management permission granted." }
            : { kind: "error", text: permissionResult.error || "Management permission was not granted. No extension data was read." },
        );
      }

      if (!granted) {
        setExtScanMessage({ kind: "error", text: "Extension scan was not run because management permission is required." });
        return;
      }

      const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.RUN_EXTENSION_SCAN });
      if (!response?.ok || !response.scan) {
        setExtScanMessage({ kind: "error", text: `Extension scan failed: ${response?.error || "no result was returned"}` });
        return;
      }

      onExtensionScan?.(response.scan);
      setExtScanMessage({
        kind: "success",
        text: `Extension scan completed: ${response.scan.extensionCount ?? 0} installed extension${response.scan.extensionCount === 1 ? "" : "s"} reviewed locally.`,
      });
    } catch (error) {
      setExtScanMessage({ kind: "error", text: `Extension scan error: ${error?.message || error}` });
    } finally {
      setExtLoading(false);
      setExtPermissionLoading(false);
    }
  };

  const runCookieScan = async () => {
    setCookieLoading(true);
    setCookieScanMessage(null);
    try {
      const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.RUN_COOKIE_SCAN });
      if (!response?.ok || !response.scan) {
        setCookieScanMessage({ kind: "error", text: `Cookie scan failed: ${response?.error || "no result was returned"}` });
        return;
      }
      onCookieScan?.(response.scan);
      setCookieScanMessage({ kind: "success", text: "Cookie scan completed locally." });
    } catch (error) {
      setCookieScanMessage({ kind: "error", text: `Cookie scan error: ${error?.message || error}` });
    } finally {
      setCookieLoading(false);
    }
  };

  const enableCookiePermission = async () => {
    setCookiePermissionLoading(true);
    setCookiePermissionMessage(null);
    const result = await requestOptionalPermission("cookies");
    setCookiePermissionLoading(false);
    setCookiePermissionMessage(
      result.granted
        ? { kind: "success", text: "Cookie permission granted." }
        : { kind: "error", text: result.error || "Cookie permission was not granted." },
    );
  };

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
            <button className="button-secondary" type="button" onClick={runCookieScan} disabled={cookieLoading || cookiePermissionLoading}>
              {cookieLoading ? "Scanning…" : "Run cookie scan"}
            </button>
            <button className="button-link" type="button" onClick={enableCookiePermission} disabled={cookieLoading || cookiePermissionLoading} style={{ marginLeft: 8 }}>
              {cookiePermissionLoading ? "Requesting…" : "Enable cookie permission"}
            </button>
            <p style={{ marginTop: 6, color: "#657282", fontSize: 11 }}>{PERMISSION_EXPLANATIONS.cookies}</p>
            {cookiePermissionMessage ? <p role="status" style={{ marginTop: 6, color: messageStyle(cookiePermissionMessage), fontSize: 12 }}>{cookiePermissionMessage.text}</p> : null}
            {cookieScanMessage ? <p role="status" style={{ marginTop: 6, color: messageStyle(cookieScanMessage), fontSize: 12 }}>{cookieScanMessage.text}</p> : null}
          </div>
        </article>

        <article className="scan-card">
          <h4>Extension scan</h4>
          <p>{latestExtension ? `Risk ${Math.round(latestExtension.risk * 100)}%` : "No extension scan"}</p>
          <p>{latestExtension ? `${latestExtension.extensionCount} extensions` : "—"}</p>
          <div style={{ marginTop: 8 }}>
            <button className="button-secondary" type="button" onClick={runExtensionScan} disabled={extLoading || extPermissionLoading}>
              {extLoading ? "Scanning…" : managementGranted === false ? "Enable & run scan" : "Run extension scan"}
            </button>
            <button className="button-link" type="button" onClick={enableManagementPermission} disabled={extLoading || extPermissionLoading} style={{ marginLeft: 8 }}>
              {extPermissionLoading ? "Requesting…" : "Enable management permission"}
            </button>
            <p style={{ marginTop: 6, color: "#657282", fontSize: 11 }}>{PERMISSION_EXPLANATIONS.management}</p>
            {extPermissionMessage ? <p role="status" style={{ marginTop: 6, color: messageStyle(extPermissionMessage), fontSize: 12 }}>{extPermissionMessage.text}</p> : null}
            {extScanMessage ? <p role="status" style={{ marginTop: 6, color: messageStyle(extScanMessage), fontSize: 12 }}>{extScanMessage.text}</p> : null}
          </div>
        </article>

        <article className="scan-card">
          <h4>Password scan</h4>
          <p>{latestPassword ? `Strength ${Math.round(latestPassword.strength * 100)}%` : "No password scan yet"}</p>
          <p>{latestPassword ? (latestPassword.reuseDetected ? "Reuse detected" : "No reuse detected") : "Type in a page password field to scan"}</p>
          <p style={{ marginTop: 6, color: "#657282", fontSize: 11 }}>
            Runs automatically after you type at least 4 characters. Your password is never stored or sent; only a salted local fingerprint is used to check reuse.
          </p>
        </article>
      </div>
    </section>
  );
}
