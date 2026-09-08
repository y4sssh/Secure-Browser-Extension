# Secure Browser Extension

A privacy-first Chrome extension prototype with a companion FastAPI backend for detecting credential phishing, brand impersonation, and unsafe form behaviors. The project targets research, reproducible demos, and enterprise integration while preserving user privacy.

Table of Contents
- [Key features](#key-features)
- [Quick start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Run backend (local)](#run-backend-local)
  - [Develop the extension](#develop-the-extension)
- [Testing](#testing)
- [Architecture overview](#architecture-overview)
- [Contributing](#contributing)
- [Security & privacy](#security--privacy)
- [License](#license)

Key features
- Privacy-preserving evidence collection and scoring with no plaintext credential storage.
- Explainable risk scoring combining URL, form, text, visual and brand signals.
- Lightweight FastAPI demo backend for analysis and evidence ingestion.
- Demo pages and automated tests to reproduce scenarios locally.

Quick start
These steps get a local development environment running for the backend and extension.

Prerequisites
- Python 3.11+
- Node.js 20+ and npm 10+
- Optional: MongoDB 6.x for persistent backend storage

Run backend (local)
1. Create and activate a virtual environment, then install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

2. Copy the example env and set any required secrets (do not commit secrets):

```bash
cp backend/.env.example backend/.env
# Edit backend/.env to set API keys and configuration
```

3. Start the demo backend (development mode):

```bash
cd backend
uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

The backend will listen at http://127.0.0.1:8000.

Develop the extension
1. Install UI dependencies and run the dashboard in dev mode:

```bash
cd extension
npm install
npm run dev
```

2. Build for distribution:

```bash
npm run build
# produced artifacts are in extension/dist
```

3. Load the extension into Chrome (Developer mode → Load unpacked → select `extension/dist`).

Testing
- Backend unit tests (from repository root):

```bash
PYTHONPATH=backend python -m pytest -q backend/tests
```

- Extension tests (run from `extension`):

```bash
cd extension
npm test
```

Architecture overview
- `extension/` — Manifest V3 UI, content scripts, service worker, and dashboard.
- `backend/` — FastAPI app with analysis, evidence ingestion, and demo routes.
- `ml/` — dataset tools and model stubs for offline experiments.
- `test-sites/` — static pages for demo and acceptance testing.

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) and [docs/API_SPEC.md](docs/API_SPEC.md) for design details and API contracts.

Contributing
- Fork, create a feature branch, run tests locally, and open a PR describing changes and rationale.
- Keep demo artifacts and test data free of real credentials or secrets.

Security & privacy
- Never log or persist raw credentials, cookies, or full user-typed values.
- Keep backend secrets (API keys) out of client-side code and the extension bundle.
- Telemetry is aggregated and sanitized; see [docs/PRIVACY.md](docs/PRIVACY.md) for the project privacy policy.

License
This project is licensed under MIT. See [LICENSE](LICENSE) for details.

Next steps
- Add GitHub Actions CI to run backend tests, extension tests, and linters on push.
- Optionally provide a one-page cheat sheet or short slide summarizing setup and demo instructions.

If you want, I can now:
- add CI configuration,
- condense this README into a one-page cheat-sheet, or
- run the test suites and report results.

  - Added the content script (`extension/src/content/contentScript.js`) to inject page scanning and listen for page lifecycle events.
  - Added extension runtime helpers in `extension/src/lib/chrome/runtime.js` and message type constants in `extension/src/lib/chrome/messageTypes.js`.

**Detailed changelog**
- **Phase 2**: Evidence engine, risk scoring, and storage.
**Extension (what changed and why)**
  - Defined structured evidence normalization in `extension/src/lib/evidence/schema.js`.
  - Implemented `extension/src/lib/storage/evidenceStorage.js` to persist recent page evidence in Chrome storage.
  - Built scoring modules for URL risk, form risk, brand risk, and final trust scoring in `extension/src/lib/scoring/`.
  - Added `extension/src/lib/evidence/evidenceSummary.js` for score formatting, trust labels, and dashboard display helpers.
  - Enabled popup/dashboard retrieval of latest and recent evidence through runtime message handlers.

- **Phase 3**: FormGuard and dynamic page scanning.
**Backend (what changed and why)**
  - Added form field and credential signal extraction in `extension/src/content/pageScanner.js`.
  - Implemented DOM `MutationObserver` to detect injected or modified forms and rescan pages on changes.
  - Added user interaction trigger handling and page location change detection for continuous analysis.
  - Implemented hidden password/credential field detection, login overlay detection, and iframe login scanning.
  - Built form timeline event generation for delayed login forms, action changes, and suspicious iframe form discovery.

- **Phase 4**: Backend scaffold and evidence ingestion.
  - Added FastAPI backend skeleton in `backend/app/main.py` with CORS enabled.
  - Implemented health endpoint in `backend/app/api/health.py`.
**ML & Fusion models**
  - Added evidence ingestion route in `backend/app/api/evidence.py` with sanitized payload logging.
  - Provided a lightweight demo server in `backend/demo_server.py` for dependency-free backend testing.
  - Added backend tests and a `backend/requirements.txt` dependency manifest.

- **Phase 5**: URL model and richer URL analysis.
**Datasets & tooling**
  - Added `ml/url_model_stub.py` with rule-based URL risk heuristics for length, HTTPS, subdomains, IP URLs, punycode, suspicious TLDs, redirects, and brand keywords.
  - Updated backend URL analysis endpoint to return `urlRisk`, feature metadata, and model version.
**Build, demo, and run notes (practical steps)**
  - Added backend tests that validate structured URL risk responses.
1. Start backend (from repo root or `backend/`):

```bash
cd backend
# activate virtualenv if used
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- **Phase 6**: Brand/Text evidence and cloud-safe backend analysis.
2. Serve demo pages (test-sites) on port 8001 to avoid conflicts with backend:
  - Extended page scanning to collect sanitized text snippets from titles, headings, labels, buttons, and accessible labels.
```bash
cd test-sites
python3 -m http.server 8001
```
  - Added brand signal extraction and brand/domain mismatch detection in `extension/src/lib/scoring/brandGuardScore.js`.
3. Build extension and load unpacked:
  - Added backend text risk endpoint in `backend/app/api/analyze.py` that enforces `cloudAiConsent` and rejects unsanitized snippets.
```bash
cd extension
npm install
npm run build
# In Chrome: chrome://extensions → Load unpacked → select extension/dist
```
  - Added backend chat explain endpoint to produce evidence-based explanation text.
4. Reload the extension after any change to `extension/dist` and open extension background DevTools to observe network calls and service worker logs.
  - Added backend tests to verify text consent, analysis, evidence ingestion, and explain endpoint behavior.
**Common issues and resolutions applied**

- Module import errors in backend (ModuleNotFoundError: "No module named 'ml'") — resolved by adding repository root to `sys.path` in `backend/app/main.py` when running in development.
- Port conflicts (static demo server vs backend) — resolved by running `test-sites` on port `8001` and keeping backend on `8000` so extension API calls (`http://127.0.0.1:8000/...`) reach the FastAPI server.
- Content script import error ("Cannot use import statement outside a module") — resolved by adjusting `manifest.json` in `extension/dist` to mark the content script as a module or by bundling imports into a non-module content script during build.
- **Next phases**: The repository is ready to evolve with:
**Tests**
  - visual signal extraction and logo-based brand detection,
- Extension unit tests: reported `12 passed` during development.
- Backend tests: reported `9 passed` during development.
  - download scanner and danger-state analysis,
If you want me to run tests now, I can execute `PYTHONPATH=backend python -m pytest -q backend/tests` and the extension test commands locally and report back.
  - password reuse/strength analysis with privacy protections,
**Notes for next steps / roadmap**
  - secure cookie metadata analysis,
- Replace rule-based URL and text stubs with trained models (XGBoost/transformers) when labeled datasets are available.
- Add visual model training and on-device logo matching for stronger brand detection.
- Harden service worker fetch handling to avoid accidental interception of backend API calls from pages served by the static demo server.
- Add CI steps to run backend and extension tests automatically.
  - extension exposure/risk scoring,

## Documentation

- Rebuild the extension and reload it automatically, or
- Run the backend and tail logs while you reproduce a failing request in Chrome DevTools so I can diagnose any remaining 404s, or
- Run the test suites and paste the results here.
- `docs/THREAT_MODEL.md` — threat model, attackers, assets, and trust boundaries.
- `docs/PRIVACY.md` — privacy rules, collected data, and backend guarantees.
- `docs/API_SPEC.md` — current backend endpoint contract and payload examples.
- `extension/dist/manifest.json` — final built manifest used to load the unpacked extension.
- `backend/app/main.py` — backend startup (contains `sys.path` fix in dev).
- `ml/fusion_model.py` and `ml/prepare_datasets.py` — model demo and dataset tooling.
- `docs/EVALUATION_PLAN.md` — metrics, datasets, and evaluation methodology.

## Extension Architecture

The `extension/` directory contains a complete Chrome Manifest V3 scaffold with:

- React-based popup UI for active tab trust scoring.
- React dashboard page for evidence review and signal history.
- MV3 service worker as the background runtime.
- Content script that scans pages at `document_idle`, monitors DOM mutations, user interactions, navigation events, and iframe loads.
- Evidence collection pipeline that builds a structured page scan payload.
- Chrome storage wrapper for recent page evidence.
- Runtime message routing between content script, service worker, popup, and dashboard.
- Browser permissions for `storage`, `tabs`, `activeTab`, `scripting`, `downloads`, and optional `cookies`, `management`.

### Key Extension Features

- Page evidence collection without reading private typed values.
- FormGuard scanning for login/password fields, hidden credential inputs, cross-origin submission, insecure form actions, and iframe login forms.
- URL scoring for suspicious hostnames, IP-based URLs, punycode, excessive subdomains, suspicious TLDs, suspicious query/path tokens, brand mismatch cues, redirects, and insecure schemes.
- A final trust score that combines URL risk, form risk, and brand/text signals into a single explainable verdict.
- Persisted recent evidence history and latest evidence retrieval.
- Popup refresh action to rescan the active tab and open the dashboard.

### How to Build and Load the Extension

1. Open a terminal and change to the extension folder:

```bash
cd extension
```

2. Install dependencies:

```bash
npm install
```

3. Build the extension bundle:

```bash
npm run build
```

4. Open Chrome and navigate to `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked** and select the `extension/dist` folder.
7. Confirm the extension appears in the toolbar.

### How to Use the Extension

1. Open a website in Chrome.
2. Click the Secure Browser extension icon.
3. Wait for the popup to display the latest scan results.
4. Review the trust score, evidence reasons, and form timeline.
5. Click **Dashboard** to open the full extension dashboard page.
6. Click **Page** to open the scanned page in a new tab.

### How It Works

1. The content script runs on pages matching `http://*/*` and `https://*/*`.
2. It scans after load and listens for DOM changes, user interaction, iframe loads, and navigation events.
3. The scanner collects evidence about forms, login fields, URL characteristics, hidden inputs, and iframes.
4. The content script sends structured evidence to the background service worker.
5. The service worker scores the evidence, tracks redirects, stores results, and exposes the latest evidence.
6. The popup UI displays the latest trust score, verdict, risk signals, and evidence details.

## Backend and Demo Server

The project includes backend support and Phase 6 demo endpoints:

- `backend/demo_server.py` provides a lightweight dependency-free demo server.
  - `GET /health` returns `{ "status": "ok" }`.
  - `POST /api/v1/evidence` accepts sanitized JSON evidence and appends it to `backend/data/evidence.jsonl`.
- `backend/app/main.py` defines a FastAPI backend with CORS enabled.
  - Includes health, analysis, evidence, and chat explain routers.
  - Supports current phase analysis endpoints.

### Backend Capabilities

- `GET /health` — returns backend health status.
- `POST /api/v1/analyze/url` — returns URL risk score and rule-based URL feature metadata.
- `POST /api/v1/analyze/text` — accepts sanitized text snippets with explicit `cloudAiConsent` and returns text risk.
- `POST /api/v1/evidence` — accepts sanitized page evidence and appends it to a backend evidence log.
- `POST /api/v1/chat/explain` — returns a simple evidence-based explanation for suspicious page behavior.

## How to Run Backend Tests

From the repo root:

```bash
PYTHONPATH=backend python -m pytest -q backend/tests
```

## Export a Change Diary PDF

Generate a PDF with git status, changed files, diff summary, and commit history:

```bash
python3 export_changes.py --output my_change_diary.pdf --mode both --full-diff
```

Options:

- `--mode diff` — working tree changes only.
- `--mode log` — commit history only.
- `--mode both` — both changes and commit history.
- `--since YYYY-MM-DD` — limit commit history.
- `--max-commits N` — maximum number of commits.
- `--full-diff` — include full patch text.

This script creates a plain PDF diary without external dependencies.

## Detailed Project Report

### What was built

- `extension/` implements the browser extension user experience and page scanning logic.
- `backend/` includes a demo server and a FastAPI application for evidence ingestion and backend development.
- `export_changes.py` is a repository utility to export git activity and diffs as a PDF report.
- `docs/IMPLEMENTATION_PLAN.md` contains the research-driven implementation plan, threat model, and roadmap.
- `test-sites/` includes sample phishing and login pages for testing.

### Major work items and recent changes

- Implemented Manifest V3 extension architecture with content scripts, a service worker, popup, and dashboard.
- Built a privacy-first evidence collector that analyzes page structure, forms, and login behavior without exposing typed passwords or raw page bodies.
- Added dynamic DOM observation in the content script to rescan pages on mutations, user interactions, location changes, iframe loads, and navigation events.
- Added a background message router in `extension/src/background/messageRouter.js` that:
  - receives scan payloads from the content script,
  - tracks redirect chains across tab navigation,
  - normalizes evidence,
  - applies redirect-related risk penalties,
  - stores evidence in Chrome local storage,
  - exposes latest and recent evidence via runtime messages.
- Built an evidence storage layer in `extension/src/lib/storage/evidenceStorage.js` to keep a capped recent evidence history.
- Implemented a popup UI in `extension/src/popup/main.jsx` with:
  - refresh scanning of the active tab,
  - trust meter display,
  - signal grid summary,
  - explainable evidence reasons,
  - form timeline details,
  - quick navigation to dashboard and current page.
- Designed scoring modules in `extension/src/lib/scoring/`:
  - `urlScore.js` for URL risk and brand/domain mismatch detection,
  - `formScore.js` for credential and form behavior risk aggregation,
  - `finalScore.js` to combine risks into a final trust score, verdict, and severity.
- Added evidence normalization and summary display helpers in `extension/src/lib/evidence/evidenceSummary.js`.
- Added Chrome runtime helpers in `extension/src/lib/chrome/runtime.js` for message passing and active tab queries.
- Extended the backend with Phase 6 endpoints in `backend/app/api/` and stronger URL risk heuristics in `ml/url_model_stub.py`.
- Added a chat explanation endpoint and sanitized evidence ingestion checks.
- Added backend and extension test coverage with passing test suites.

### Implemented detection capabilities

- URL signal detection for:
  - insecure HTTP or non-HTTPS pages,
  - IP-based hostnames,
  - punycode/homograph domains,
  - suspicious TLDs and path/query tokens,
  - excessive subdomains,
  - brand keyword mismatches,
  - redirect chain risk.
- Form risk detection for:
  - password fields and login-like forms,
  - cross-origin and cross-domain credential submission,
  - insecure form submission over HTTP,
  - password form action changes after page load,
  - hidden credential/password fields,
  - disabled autocomplete and anti-analysis controls,
  - login forms inside iframes,
  - delayed form appearance and overlays.
- Brand and text evidence support for:
  - sanitized snippet scoring,
  - claimed brand mismatch detection,
  - evidence-based text risk scoring.
- Browser evidence tracking for:
  - page load trigger events,
  - DOM mutation-triggered scans,
  - user interaction events,
  - location changes and iframe load events,
  - persisted evidence history.

### Repository-level tooling and documentation

- `export_changes.py` generates a PDF change diary for git status, changed files, diff summary, patch text, and commit history.
- `backend/README_DEMO.md` documents running the demo backend and its endpoints.
- `docs/IMPLEMENTATION_PLAN.md` captures the high-level threat model, project goals, and planned advanced features.

### Notes on current project scope

- The current codebase delivers Phases 1–3 extension scanning and Phase 6 backend support.
- Phase 5 URL scoring is currently a rule-based heuristic model pending a trained ML model.
- The backend supports current evidence ingestion and analysis contracts with privacy protections.
- The extension remains privacy-first and avoids unnecessary access to raw passwords or full page bodies.
