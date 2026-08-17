import { useState, useEffect } from "react";
import { ShieldCheck, Cloud, KeyRound } from "lucide-react";

const STORAGE_KEY = "secureBrowser.consents";

export function ConsentPanel() {
  const [cloudAiConsent, setCloudAiConsent] = useState(false);
  const [hibpConsent, setHibpConsent] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get({ [STORAGE_KEY]: {} }, (items) => {
      const consents = items?.[STORAGE_KEY] || {};
      setCloudAiConsent(Boolean(consents.cloudAi));
      setHibpConsent(Boolean(consents.hibp));
      setLoading(false);
    });
  }, []);

  const updateConsent = async (key, value) => {
    chrome.storage.local.get({ [STORAGE_KEY]: {} }, (items) => {
      const next = { ...(items?.[STORAGE_KEY] || {}), [key]: value };
      chrome.storage.local.set({ [STORAGE_KEY]: next });
    });
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
        These settings control whether the extension contacts external services. You can change them anytime.
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
      </div>
    </section>
  );
}

export default ConsentPanel;
