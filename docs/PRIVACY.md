# Privacy Design

## Privacy Principles

- Minimize data collection.
- Analyze as much as possible locally in the extension.
- Never collect raw passwords, cookie values, or full private page bodies.
- Request sensitive permissions only when features are enabled.
- Keep backend analysis limited to sanitized evidence.

## Data Collected

- Page metadata: URL, hostname, protocol, redirect count, page title length, number of forms.
- Form signals: password field presence, action destination metadata, hidden credential fields, cross-origin submission.
- Brand signals: claimed brand keywords, domain mismatch indicators, sanitized text snippets when consented.
- Evidence timeline events and alert reasons.

## Data Not Collected

- Raw password strings or typed credential values.
- Cookie values.
- Raw HTML page bodies or unredacted page content.
- Download file content.
- Browser history and session details beyond the current page evidence.

## Permission Usage

- `storage`: Store recent page evidence and configuration locally.
- `tabs` / `activeTab`: Inspect the active tab and trigger page scans.
- `scripting`: Inject or communicate with the content script when needed.
- `downloads`: Detect download events and score file risk locally.
- Optional `cookies`: Read cookie metadata only after explicit user opt-in.
- Optional `management`: Inspect installed extension metadata only after user enables extension scanning.

## Backend Privacy Guarantees

- Evidence ingestion rejects payloads containing raw secrets, email addresses, phone numbers, tokens, or full HTML bodies.
- The backend stores only sanitized evidence and derived risk scores.
- Any optional external reputation checks (e.g. VirusTotal) are performed from the backend with the API key kept server-side.
- Chat explanations are generated from structured evidence only and do not accept raw sensitive content.
