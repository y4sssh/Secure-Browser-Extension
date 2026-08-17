import { ShieldCheck } from "lucide-react";

export function PrivacyNotice() {
  return (
    <section className="privacy-notice">
      <div className="section-header">
        <ShieldCheck size={18} aria-hidden="true" />
        <h3>Privacy and security</h3>
      </div>
      <ul>
        <li>Raw passwords are never stored or sent. Only salted hashes are kept locally for reuse detection.</li>
        <li>Cookie values are never stored or sent. Only metadata (domain, flags, expiry) is analyzed.</li>
        <li>Downloaded files are never uploaded automatically. Risk scoring uses filenames and browser danger state only.</li>
        <li>VirusTotal lookups, if enabled, run through the backend. The API key never leaves the server.</li>
        <li>Cloud AI text analysis requires your explicit consent and rejects unsanitized snippets.</li>
        <li>Evidence is limited to recent page scans (max 50). It is not full browsing history.</li>
        <li>Extensions with sensitive permissions (cookies, management) are scanned only after you grant optional permission.</li>
        <li>Model explanations are based on structured evidence, not raw page content.</li>
      </ul>
    </section>
  );
}

export default PrivacyNotice;
