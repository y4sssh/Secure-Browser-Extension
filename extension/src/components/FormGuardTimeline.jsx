import { Clock3 } from "lucide-react";

const EVENT_LABELS = {
  initial_scan: "Initial page scan",
  form_added: "Form added",
  password_field_detected: "Password field detected",
  delayed_password_field: "Delayed password field",
  login_form_detected: "Login form detected",
  delayed_login_form: "Delayed login form",
  form_action_changed: "Submit destination changed",
  iframe_login_detected: "Iframe login detected",
  login_overlay_detected: "Login overlay detected",
  cross_domain_password_form: "Cross-domain password form",
  insecure_password_submit: "HTTP password submit",
  credential_iframe_seen: "Login-looking iframe",
};

export function FormGuardTimeline({ timeline = [] }) {
  const events = Array.isArray(timeline) ? timeline.slice(-5).reverse() : [];

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="formguard-timeline" aria-label="FormGuard timeline">
      <div className="section-title">
        <Clock3 size={16} aria-hidden="true" />
        <h2>FormGuard</h2>
      </div>
      <ol>
        {events.map((event, index) => (
          <li key={`${event.event}-${event.elapsedMs}-${index}`}>
            <span>{EVENT_LABELS[event.event] ?? formatEventName(event.event)}</span>
            <time>{formatElapsed(event.elapsedMs)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatEventName(value) {
  return String(value ?? "Form event")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatElapsed(value) {
  if (!Number.isFinite(value)) return "0s";
  if (value < 1000) return "0s";
  return `${Math.round(value / 1000)}s`;
}
