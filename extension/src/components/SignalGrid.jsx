export function SignalGrid({ evidence }) {
  const signals = evidence?.signals ?? {};
  const items = [
    ["HTTPS", signals.https ? "Yes" : "No"],
    ["Forms", signals.formCount ?? 0],
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
