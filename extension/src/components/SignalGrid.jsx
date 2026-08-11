export function SignalGrid({ evidence }) {
  const signals = evidence?.signals ?? {};
  const scores = evidence?.scores ?? {};
  const items = [
    ["HTTPS", signals.https ? "Yes" : "No"],
    ["URL risk", formatRisk(scores.urlRisk)],
    ["Form risk", formatRisk(scores.formRisk)],
    ["Brand risk", formatRisk(scores.brandRisk)],
    ["Download risk", formatRisk(scores.downloadRisk)],
    ["Extension risk", formatRisk(scores.extensionExposureRisk)],
    ["Redirects", signals.redirectCount ?? evidence?.redirect?.count ?? 0],
    ["Password fields", signals.passwordFieldCount ?? 0],
    ["Cross-domain posts", signals.formPostsCrossDomain ? "Yes" : "No"],
    ["HTTP submit", signals.formPostsToHttp ? "Yes" : "No"],
    ["Delayed login", signals.delayedPasswordField || signals.formActionChanged ? "Yes" : "No"],
    ["Iframe login", signals.iframeLogin || signals.suspectedCredentialIframeCount > 0 ? "Yes" : "No"],
    ["Claimed brand", signals.claimedBrand || "None"],
    ["Brand mismatch", signals.brandDomainMismatch ? "Yes" : "No"],
    ["Text snippets", signals.textSnippetCount ?? evidence?.textSignals?.snippetCount ?? 0],
  ];

  return (
    <dl className="signal-grid">
      {items.map(([label, value]) => (
        <div key={label} className="signal-item">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatRisk(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}
