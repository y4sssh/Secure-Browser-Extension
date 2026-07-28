import { CheckCircle2 } from "lucide-react";

export function EvidenceReasons({ reasons = [] }) {
  return (
    <ul className="reason-list" aria-label="Evidence reasons">
      {reasons.map((reason) => (
        <li key={reason}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}
