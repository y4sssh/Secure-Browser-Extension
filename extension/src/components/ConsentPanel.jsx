import { useState, useEffect } from "react";
import { ShieldCheck, Cloud, KeyRound, Globe2, ScanSearch, Cookie, ShieldAlert } from "lucide-react";
import { getConsentSettings, setConsentSettings } from "../lib/consent.js";

const STORAGE_KEY = "secureBrowser.consents";

export function ConsentPanel() {
  const [cloudAiConsent, setCloudAiConsent] = useState(false);
  const [hibpConsent, setHibpConsent] = useState(false);
  const [reputationLookupConsent, setReputationLookupConsent] = useState(false);
  const [downloadScanConsent, setDownloadScanConsent] = useState(false);
  const [cookieAuditConsent, setCookieAuditConsent] = useState(false);
  const [extensionAuditConsent, setExtensionAuditConsent] = useState(false);
  const [riskLockdownEnabled, setRiskLockdownEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConsentSettings().then(({ cloudAi, hibp, reputationLookup, downloadScan, cookieAudit, extensionAudit, riskLockdownEnabled: lockdownEnabled }) => {
      setCloudAiConsent(Boolean(cloudAi));
      setHibpConsent(Boolean(hibp));
      setReputationLookupConsent(Boolean(reputationLookup));
      setDownloadScanConsent(Boolean(downloadScan));
      setCookieAuditConsent(Boolean(cookieAudit));
      setExtensionAuditConsent(Boolean(extensionAudit));
      setRiskLockdownEnabled(Boolean(lockdownEnabled));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const updateConsent = async (key, value) => {
    await setConsentSettings({ [key]: value });
  };

  const handleCloudAiChange = (event) => {
    const value = event.target.checked;
    setCloudAiConsent(value);
    updateConsent("cloudAi", value);
  };

  const handleHibpChange = (event) => {
    const value = event.target.checked;
    setHibpConsent(value);
    updateConsent("hibp", value);
  };

  const handleReputationLookupChange = (event) => {
    const value = event.target.checked;
    setReputationLookupConsent(value);
    updateConsent("reputationLookup", value);
  };

  const handleDownloadScanChange = (event) => {
    const value = event.target.checked;
    setDownloadScanConsent(value);
    updateConsent("downloadScan", value);
  };

  const handleCookieAuditChange = (event) => {
    const value = event.target.checked;
    setCookieAuditConsent(value);
    updateConsent("cookieAudit", value);
  };

  const handleExtensionAuditChange = (event) => {
    const value = event.target.checked;
    setExtensionAuditConsent(value);
    updateConsent("extensionAudit", value);
  };

  const handleRiskLockdownChange = (event) => {
    const value = event.target.checked;
    setRiskLockdownEnabled(value);
    updateConsent("riskLockdownEnabled", value);
  };

  if (loading) {
    return (
      <section className="consent-panel">
        <h3>External scan consent</h3>
        <p className="status-line">Loading preferences...</p>
      </section>
    );
  }

  return (
    <section className="consent-panel">
      <div className="section-header">
        <ShieldCheck size={18} aria-hidden="true" />
        <h3>External scan consent</h3>
      </div>
      <p style={{ marginTop: 4, marginBottom: 10, color: "#657282", fontSize: 12 }}>
        These settings control whether the extension contacts external services or performs advanced security analysis. You can change them anytime.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={cloudAiConsent}
            onChange={handleCloudAiChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Cloud AI text analysis</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              <Cloud size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
              Allow sanitized text snippets to be sent to the backend for brand-risk analysis. Raw passwords, emails, and tokens are never sent.
            </p>
          </div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={reputationLookupConsent}
            onChange={handleReputationLookupChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Threat reputation lookups</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              <Globe2 size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
              Query external reputation feeds for URL and domain risk scoring while keeping browsing history and private page content local.
            </p>
          </div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={downloadScanConsent}
            onChange={handleDownloadScanChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Download risk scanning</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              <ScanSearch size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
              Check suspicious executable, archive, or script downloads without uploading file contents unless you explicitly allow external file inspection.
            </p>
          </div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={hibpConsent}
            onChange={handleHibpChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Have I Been Pwned password check</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              <KeyRound size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
              Allow checking password strength against known breaches using k-anonymity. Only the first 5 characters of a SHA-1 hash are sent.
            </p>
          </div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={cookieAuditConsent}
            onChange={handleCookieAuditChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Cookie and session hardening audit</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              <Cookie size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
              Analyze cookie security flags such as Secure, HttpOnly, and SameSite without storing cookie values or sensitive session data.
            </p>
          </div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={extensionAuditConsent}
            onChange={handleExtensionAuditChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Installed extension exposure audit</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              <ShieldAlert size={12} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
              Review extension permissions, host access, and risky install patterns while making it clear that this is exposure analysis, not proof of active data theft.
            </p>
          </div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={riskLockdownEnabled}
            onChange={handleRiskLockdownChange}
            style={{ marginTop: 3 }}
          />
          <div>
            <strong>Risk lockdown overlay</strong>
            <p style={{ margin: "2px 0 0", color: "#657282", fontSize: 12 }}>
              Block risky pages with a full-screen warning and a clear choice to close the tab or continue only after confirming trust.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}

export default ConsentPanel;
