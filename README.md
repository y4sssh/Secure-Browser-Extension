# Secure-Browser-Extension

Secure-Browser-Extension is a privacy-minded Chrome browser extension prototype that observes browser events, page content signals, form behavior, and URL characteristics to detect suspicious page activity and phishing risk. The extension is built as a Manifest V3 app with a React popup, dashboard UI, page-scanning content script, and a service worker that stores and processes evidence.

## Phase 1 Extension Scaffold

The `extension/` directory contains a complete Chrome Manifest V3 scaffold with:

- React-based popup UI for active tab trust scoring.
- React dashboard page for evidence review and signal details.
- MV3 service worker as the background runtime.
- Content script that scans websites at `document_idle`, monitors DOM mutations, user interactions, navigation events, and iframe load events.
- Evidence collection pipeline that builds a structured page scan payload.
- Chrome storage wrapper for recent page evidence.
- Runtime message routing between content script, service worker, popup, and dashboard.
- Browser permissions for `storage`, `tabs`, `activeTab`, `scripting`, `downloads`, and optional `cookies`, `management`.

### Key Extension Features

- Page evidence collection without reading private typed values.
- FormGuard scanning for login/password fields, hidden credential inputs, cross-origin submission, insecure form actions, and iframe login forms.
- URL scoring for suspicious hostnames, IP-based URLs, punycode, excessive subdomains, suspicious tokens, brand mismatches, redirects, and insecure schemes.
- Final trust scoring that combines URL risk and form risk into a single explainable verdict.
- Persisted recent evidence history and latest evidence retrieval.
- Popup actions to refresh active tab scanning and open the dashboard.

### How to Build and Load the Extension

Follow these steps to prepare and load the extension into Chrome:

1. Open a terminal and change to the extension folder:

```bash
cd extension
```

2. Install the JavaScript dependencies:

```bash
npm install
```

3. Build the extension bundle:

```bash
npm run build
```

4. Open Chrome and navigate to `chrome://extensions`.
5. Enable **Developer mode** in the top-right corner.
6. Click **Load unpacked** and select the `extension/dist` folder.
7. Confirm the extension appears in the toolbar.

### How to Use the Extension

1. Open a website in Chrome.
2. Click the Secure Browser extension icon.
3. Wait for the popup to display the latest scan results.
4. Review the trust score, evidence reasons, and form timeline.
5. Click **Dashboard** to open the full extension dashboard page.
6. Click **Page** to open the scanned page in a new tab.

### How It Works: Step by Step

1. The content script runs on every page matching `http://*/*` and `https://*/*`.
2. It scans the page after load and listens for DOM changes, user input, iframe loads, and navigation events.
3. The scanner collects evidence about forms, login fields, URL characteristics, hidden inputs, and iframe behavior.
4. The content script sends this structured evidence to the background service worker.
5. The service worker scores the evidence, tracks redirects, and saves the result in Chrome storage.
6. The popup UI requests the latest evidence and displays the final trust score, verdict, and risk signals.

## Backend and Demo Server

The project also includes backend support and demo endpoints:

- `backend/demo_server.py` provides a lightweight dependency-free demo server.
  - `GET /health` returns `{ "status": "ok" }`.
  - `POST /api/v1/evidence` accepts sanitized JSON evidence and appends it to `backend/data/evidence.jsonl`.
- `backend/app/main.py` defines a FastAPI backend application with CORS enabled.
  - Includes health, analysis, and evidence routers.
  - Serves as the basis for a future production-grade backend.

## Export a Change Diary PDF

From the project root, you can generate a PDF that lists git status, changed files, diff summary, and commit history:

```bash
python3 export_changes.py --output my_change_diary.pdf --mode both --full-diff
```

Options:

- `--mode diff` — export working tree changes only.
- `--mode log` — export commit history only.
- `--mode both` — export both changes and commit history.
- `--since YYYY-MM-DD` — limit commit history to recent commits.
- `--max-commits N` — include at most N commits.
- `--full-diff` — include the full patch text.

This script creates a plain PDF diary without external dependencies.

## Detailed Project Report

### What was built

- `extension/` implements the browser extension user experience and page scanning logic.
- `backend/` includes a demo server and a FastAPI application for evidence ingestion and backend development.
- `export_changes.py` is a repository-level utility to export git activity and diffs as a PDF report.
- `docs/IMPLEMENTATION_PLAN.md` contains the research-driven implementation plan, expected threat model, and feature roadmap.
- `test-sites/` includes sample pages for form, iframe, login, and phishing test cases.

### Major work items and changes

- Implemented Chrome Manifest V3 extension architecture with content scripts, a service worker, popup, and dashboard.
- Built a privacy-first evidence collector that analyzes page structure, forms, and login-related behavior without exposing typed passwords or page content.
- Added dynamic DOM observation in the content script to rescan pages on mutations, user interactions, location changes, iframe loads, and navigation events.
- Created a background message router in `extension/src/background/messageRouter.js` that:
  - receives scan payloads from the content script,
  - tracks redirect chains across tab navigation,
  - normalizes evidence,
  - applies redirect-related risk penalties,
  - stores evidence in Chrome local storage,
  - exposes latest and recent evidence via runtime messages.
- Built an evidence storage layer in `extension/src/lib/storage/evidenceStorage.js` to keep a capped recent evidence history and return the latest page scan.
- Implemented a popup UI in `extension/src/popup/main.jsx` with:
  - refresh scanning of the active tab,
  - trust meter display,
  - signal grid summary,
  - explainable evidence reasons,
  - form timeline details,
  - quick navigation to the dashboard and current page.
- Designed scoring modules across `extension/src/lib/scoring/`:
  - `urlScore.js` for URL risk features and brand/domain mismatch detection,
  - `formScore.js` for credentials and form behavior risk aggregation,
  - `finalScore.js` to combine risks into a final trust score, verdict, and severity.
- Added a reusable evidence summary module in `extension/src/lib/evidence/evidenceSummary.js` for display labels, score formatting, and trust categorization.
- Included Chrome runtime helpers in `extension/src/lib/chrome/runtime.js` for safe message passing and active tab queries.
- Added a lightweight demo backend for testing ingestion of sanitized evidence and health checks.
- Added git change export tooling with `export_changes.py` to produce PDF diaries from git status, diff summary, patch content, and commit history.

### Implemented detection capabilities

- URL signal detection for:
  - insecure HTTP or non-HTTPS pages,
  - embedded credentials in URLs,
  - `@` symbol misuse,
  - punycode/homograph domains,
  - suspicious TLDs and path/query tokens,
  - excessive subdomains,
  - brand keyword mismatches and suspicious brand references,
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
- Browser evidence tracking for:
  - page load trigger events,
  - content script scan triggers from DOM mutations,
  - user interaction events,
  - page location changes and iframe loads,
  - persistence of observed evidence with history.

### Repository-level tooling and documentation

- `export_changes.py` generates a PDF change diary for current git status, changed file names, diff summary, full patch text, and commit history.
- `backend/README_DEMO.md` documents running the demo backend and its available endpoints.
- `docs/IMPLEMENTATION_PLAN.md` captures the high-level threat model, project goals, and planned advanced features.

### Notes on current project scope

- The current codebase focuses on Phase 1 browser extension scaffold and evidence-driven phishing/form detection.
- Backend implementation is available as a basic demo server and FastAPI skeleton, ready for future expansion.
- The extension is designed to be privacy-first, avoiding unnecessary access to page content or user credential data.
