export function SignalGrid({ evidence }) {
  const signals = evidence?.signals ?? {};
  const scores = evidence?.scores ?? {};
  const items = [
    ["HTTPS", signals.https ? "Yes" : "No"],
    ["URL risk", formatRisk(scores.urlRisk)],
    ["Form risk", formatRisk(scores.formRisk)],
    ["Redirects", signals.redirectCount ?? evidence?.redirect?.count ?? 0],
    ["Password fields", signals.passwordFieldCount ?? 0],
    ["Cross-origin posts", signals.formPostsCrossOrigin ? "Yes" : "No"],
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
