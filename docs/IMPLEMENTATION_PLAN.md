# Secure Browser Extension - Full Working Implementation Plan

Last updated: 2026-07-28

## 1. Project Goal

Build an advanced AI-assisted Chrome browser extension that improves browsing safety by detecting phishing pages, suspicious downloads, insecure cookies, password reuse risk, and unsafe installed extensions.

The strongest research contribution is not simply "AI scans URLs." The project should be centered on an evidence-driven zero-day phishing detector:

```text
URL + redirects + page text + login forms + brand signals + visual signals + extension exposure
        -> evidence graph
        -> trust score
        -> explainable alert
        -> dashboard/report
```

The extension should be privacy-first. It should avoid collecting raw passwords, cookie values, or full private page content. It should send only sanitized evidence to the backend unless the user clearly opts in.

## 2. Final Product

The final project should include:

- Chrome Manifest V3 extension.
- React popup UI.
- React dashboard page.
- Content script for page/security evidence collection.
- Service worker for extension events, scoring, and storage.
- FastAPI backend for AI/reputation services.
- MongoDB database for sanitized events, alerts, reports, and model metadata.
- ML pipeline for URL, text, and visual phishing detection.
- Weekly security report generator.
- Evidence-based AI chatbot.
- Research report with evaluation metrics.

## 3. Main Advanced Features

### 3.1 URL Analyzer

Purpose: Detect suspicious URLs and domains.

Features:

- Parse hostname, path, query, TLD, subdomains.
- Detect IP-address URLs.
- Detect punycode/homograph indicators.
- Detect excessive subdomains.
- Detect brand keywords in unrelated domains.
- Detect suspicious URL length.
- Detect suspicious path/query tokens.
- Track redirect chain.
- Check HTTPS status.
- Check known malicious URL feeds.
- Produce URL risk score.

Model:

- Start with rules.
- Add XGBoost classifier later.

### 3.2 FormGuard

Purpose: Detect credential theft behavior, including zero-day phishing.

This should be the core advanced feature.

Features:

- Detect login/password fields.
- Detect forms that submit credentials over HTTP.
- Detect forms that post to a different domain.
- Detect hidden login fields.
- Detect injected password fields after page load.
- Detect form action changes after page load.
- Detect login forms inside iframes.
- Detect suspicious overlay login modals.
- Detect disabled browser autocomplete or anti-analysis tricks.
- Re-analyze after user interaction, navigation, redirect, or CAPTCHA completion.

Important privacy rule:

- Never read or store typed password values.
- Only inspect field metadata and form destination.

### 3.3 BrandGuard

Purpose: Detect mismatch between claimed brand and real domain.

Features:

- Extract brand-like names from page title, headings, labels, alt text, favicon, and visible login text.
- Detect brand keywords in URL/path.
- Compare claimed brand with registered domain.
- Add visual logo detection later.
- Produce explanation: "This page appears to request Microsoft credentials but is not hosted on a Microsoft-controlled domain."

Model:

- Start with brand dictionary and rules.
- Add BERT/DistilBERT text classifier.
- Add visual logo classifier later.

### 3.4 Evidence Graph

Purpose: Make the system explainable.

Example evidence object:

```json
{
  "tabId": 123,
  "url": "https://example-login.test/account",
  "timestamp": "2026-07-28T10:30:00Z",
  "signals": {
    "https": true,
    "hasPasswordField": true,
    "formPostsCrossOrigin": true,
    "claimedBrand": "Microsoft",
    "brandDomainMismatch": true,
    "redirectCount": 2,
    "iframeLogin": false,
    "domainLooksRandom": false,
    "knownBadFeedHit": false
  },
  "scores": {
    "urlRisk": 0.41,
    "formRisk": 0.89,
    "brandRisk": 0.92,
    "downloadRisk": 0.0,
    "extensionExposureRisk": 0.0,
    "finalTrustScore": 18
  },
  "verdict": "high_risk",
  "reasons": [
    "Password form submits to a different domain",
    "Page claims Microsoft identity but domain does not match",
    "Login form appeared after page load"
  ]
}
```

### 3.5 Download Scanner

Purpose: Warn users about suspicious downloads.

Features:

- Observe Chrome download events.
- Score source URL.
- Detect file extension mismatch.
- Detect double extensions such as `invoice.pdf.exe`.
- Detect right-to-left override filename tricks.
- Detect risky extensions: `.exe`, `.msi`, `.bat`, `.cmd`, `.scr`, `.js`, `.vbs`, `.jar`, `.ps1`, `.iso`, `.apk`.
- Use Chrome download danger state.
- Optional VirusTotal hash or file scan through backend.

Important privacy rule:

- Do not upload file contents automatically.
- Ask for explicit consent before external file scanning.

### 3.6 Password Analyzer

Purpose: Improve password safety without collecting passwords.

Features:

- Detect password reuse locally using salted/HMAC fingerprints.
- Strength estimate locally.
- Optional Have I Been Pwned Pwned Passwords k-anonymity check.

Important privacy rule:

- Never store raw password.
- Never send raw password.
- If using HIBP, hash locally and send only the first 5 SHA-1 characters.

### 3.7 Cookie Analyzer

Purpose: Warn about weak cookie security attributes.

Features:

- Detect cookies missing `Secure`.
- Detect cookies missing `HttpOnly` when visible through APIs.
- Detect cookies missing or weakening `SameSite`.
- Detect long-lived session cookies.
- Detect third-party cookie risk.

Important privacy rule:

- Do not store cookie values.
- Store only metadata: name hash, domain, flags, expiry, risk.

### 3.8 Extension Scanner

Purpose: Warn users about risky installed extensions.

Features:

- Use Chrome `management` API.
- List installed extensions.
- Score permissions.
- Score broad host permissions such as `<all_urls>`.
- Detect sideloaded/development extensions.
- Detect recently changed permissions or versions.
- Explain risk in human language.

Important feasibility rule:

- A normal Chrome extension cannot reliably inspect another extension's full source code or prove runtime data theft.
- Present this as exposure/risk analysis, not live exfiltration detection.

### 3.9 AI Chatbot

Purpose: Explain alerts and guide users.

Features:

- "Why is this page risky?"
- "What should I do now?"
- "Which installed extension is dangerous?"
- "Summarize my weekly report."

Important privacy rule:

- Chatbot receives structured evidence only.
- Chatbot must not receive passwords, cookies, raw page text from private pages, or full browsing history.
- Chatbot should not be the final security authority. It explains model/rule evidence.

### 3.10 Threat Dashboard

Purpose: Give the user visibility.

Views:

- Current page trust score.
- Recent alerts.
- Evidence timeline.
- Risky downloads.
- Cookie health.
- Password warnings.
- Extension exposure map.
- Weekly report.
- Settings and privacy controls.

## 4. Recommended Tech Stack

Frontend/extension:

- Chrome Manifest V3
- React
- JavaScript
- Vite
- Chrome Extension APIs
- Optional later: TypeScript

Backend:

- Python 3.11+
- FastAPI
- Pydantic
- MongoDB
- PyMongo async driver
- Uvicorn

ML:

- scikit-learn
- XGBoost
- TensorFlow or PyTorch for training
- TensorFlow.js or ONNX Runtime Web for browser-side inference
- Hugging Face Transformers for BERT/DistilBERT text classifier

Testing:

- pytest for backend
- Playwright for frontend/dashboard
- Chrome extension manual and automated tests

External intelligence:

- VirusTotal API
- PhishTank
- OpenPhish
- URLhaus
- Tranco
- Have I Been Pwned Pwned Passwords

## 5. Repository Structure

Create this structure:

```text
.
├── README.md
├── LICENSE
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── THREAT_MODEL.md
│   ├── PRIVACY.md
│   ├── RESEARCH_NOTES.md
│   ├── API_SPEC.md
│   └── EVALUATION_PLAN.md
├── extension/
│   ├── manifest.json
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── src/
│   │   ├── popup/
│   │   ├── dashboard/
│   │   ├── background/
│   │   ├── content/
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── evidence/
│   │   │   ├── scoring/
│   │   │   ├── privacy/
│   │   │   ├── storage/
│   │   │   └── chrome/
│   │   └── styles/
│   └── public/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   ├── db/
│   │   ├── models/
│   │   ├── services/
│   │   └── reports/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── ml/
│   ├── datasets/
│   ├── notebooks/
│   ├── training/
│   ├── models/
│   ├── evaluation/
│   └── README.md
└── test-sites/
    ├── benign-login/
    ├── phishing-cross-domain/
    ├── injected-form/
    ├── iframe-login/
    └── download-samples/
```

## 6. Phase-by-Phase Build Plan

## Phase 0 - Foundation Documents

Goal: Make the project clear before writing major code.

Files to create:

- `docs/THREAT_MODEL.md`
- `docs/PRIVACY.md`
- `docs/API_SPEC.md`
- `docs/EVALUATION_PLAN.md`
- Update `README.md`

Tasks:

- Define protected assets: passwords, cookies, downloads, browsing sessions, extension inventory.
- Define attackers: phishing sites, malicious downloads, over-permissioned extensions, fake login pages.
- Define trust boundaries: browser page, content script, service worker, backend, database, third-party APIs.
- Define privacy rules.
- Define final demo scenarios.

Acceptance criteria:

- Anyone can read the docs and understand what the system protects, what it does not protect, and what data it stores.

## Phase 1 - Chrome Extension Scaffold

Goal: Create a working installable MV3 extension.

Tasks:

- Create React/Vite app in `extension/`.
- Add `manifest.json`.
- Add popup page.
- Add dashboard page.
- Add service worker.
- Add content script.
- Add local storage wrapper.
- Add message passing between content script, service worker, popup, and dashboard.

Initial permissions:

```json
{
  "permissions": [
    "storage",
    "tabs",
    "activeTab",
    "scripting",
    "downloads"
  ],
  "optional_permissions": [
    "cookies",
    "management"
  ],
  "host_permissions": [
    "http://*/*",
    "https://*/*"
  ]
}
```

Note:

- For privacy, request sensitive permissions only when a user enables that module.
- Use `activeTab` where possible.

Acceptance criteria:

- Extension loads in Chrome.
- Popup opens.
- Dashboard opens.
- Content script can send current page evidence to service worker.
- Service worker stores evidence in Chrome storage.

## Phase 2 - Evidence Engine and Local Trust Score

Goal: Build the local security brain before external APIs.

Tasks:

- Create evidence schema.
- Create URL feature extractor.
- Create form feature extractor.
- Create redirect tracker.
- Create risk scoring function.
- Create alert severity levels.
- Store recent page analyses locally.

Files:

- `extension/src/lib/evidence/schema.js`
- `extension/src/lib/scoring/urlScore.js`
- `extension/src/lib/scoring/formScore.js`
- `extension/src/lib/scoring/finalScore.js`
- `extension/src/content/pageScanner.js`
- `extension/src/background/messageRouter.js`

Trust score scale:

- `80-100`: trusted/low risk
- `50-79`: caution
- `20-49`: risky
- `0-19`: high risk

Acceptance criteria:

- Visiting a normal page produces a low-risk score.
- Visiting a local fake phishing test page produces a high-risk score.
- Popup explains top reasons.

## Phase 3 - FormGuard

Goal: Add the main advanced phishing detector.

Tasks:

- Detect password fields.
- Detect login-related text and labels.
- Detect form `action`.
- Compare form action domain with page domain.
- Detect insecure HTTP submit.
- Detect iframe login forms.
- Add `MutationObserver`.
- Re-run scanner when forms are added or changed.
- Track page state timeline.

High-risk examples:

- Password form posts to another domain.
- Login form appears only after delay.
- Page claims a known brand but form posts to unknown domain.
- HTTP page asks for password.

Acceptance criteria:

- `test-sites/phishing-cross-domain` triggers high risk.
- `test-sites/injected-form` triggers high risk after DOM mutation.
- Extension explains the exact form risk.

## Phase 4 - Backend API

Goal: Implement a minimal, documented FastAPI backend that provides reputation/query endpoints, accepts sanitized evidence, and can be extended with ML inference and reporting.

Endpoints:

```text
GET  /health
POST /api/v1/analyze/url
POST /api/v1/evidence
POST /api/v1/reputation/virustotal/url
POST /api/v1/reputation/virustotal/file-hash
GET  /api/v1/reports/weekly
POST /api/v1/chat/explain
```

MongoDB collections:

```text
events
alerts
page_analyses
downloads
cookie_findings
password_findings
extension_findings
weekly_reports
model_versions
```

Environment variables:

```text
SECURE_BROWSER_MONGODB_URI=
SECURE_BROWSER_DB_NAME=secure_browser
SECURE_BROWSER_VT_API_KEY=
SECURE_BROWSER_ALLOWED_ORIGINS=
SECURE_BROWSER_ENV=development
```

Acceptance criteria:

- Backend starts with `uvicorn app.main:app --reload`.
- `/health` returns OK.
- Extension can submit sanitized evidence.
- Backend stores events in MongoDB.

## Phase 5 - URL AI Model

Goal: Train and integrate XGBoost URL classifier.

Dataset sources:

- PhishTank phishing URLs.
- OpenPhish phishing URLs.
- URLhaus malware URLs for download-related risk.
- Tranco top domains for benign samples.

Features:

- URL length.
- Hostname length.
- Number of dots.
- Number of hyphens.
- Number of subdomains.
- Uses IP address.
- Uses HTTPS.
- Suspicious TLD.
- Punycode.
- Brand keyword mismatch.
- Query length.
- Path token count.
- Entropy of hostname.
- Redirect count.

Training steps:

- Build dataset.
- Clean duplicate domains.
- Split by domain family to avoid leakage.
- Train baseline logistic regression.
- Train XGBoost.
- Calibrate probabilities.
- Export model.
- Serve model in FastAPI first.

Acceptance criteria:

- Model returns risk probability.
- Evaluation includes precision, recall, F1, PR-AUC, and false positive rate.
- Baseline and XGBoost comparison is documented.

## Phase 6 - BrandGuard and Text AI

Goal: Detect brand impersonation.

Tasks:

- Extract visible page text safely.
- Redact emails, numbers, tokens, and long strings.
- Extract title, headings, button labels, form labels.
- Build claimed-brand detector.
- Add BERT/DistilBERT classifier for phishing text.
- Add backend endpoint for text risk.

Privacy rule:

- Do not send full page body by default.
- Send short sanitized snippets only if user enables cloud AI.

Acceptance criteria:

- Fake Microsoft/Google/PayPal login page is detected as brand mismatch.
- Dashboard explains claimed brand vs actual domain.

## Phase 7 - Visual Detection

Goal: Add visual signal without depending on it alone.

Tasks:

- Capture visible-page screenshot only with user permission or active analysis.
- Detect logo or known-brand visual similarity.
- Add CNN/embedding model.
- Fuse visual score with URL/FormGuard/BrandGuard.

Important:

- Visual detection can be bypassed, so it must be one signal, not the entire verdict.

Acceptance criteria:

- Visual signal appears in evidence graph.
- System still detects risky page when logo is modified but form/domain signals are suspicious.

## Phase 8 - Download Scanner

Goal: Detect suspicious downloads.

Tasks:

- Listen to download events.
- Score source URL.
- Check filename risk.
- Check extension mismatch.
- Check Chrome danger state.
- Add optional VirusTotal hash lookup.
- Add optional explicit file upload flow.

Acceptance criteria:

- Suspicious filename triggers warning.
- Known dangerous source URL increases risk.
- No file is uploaded without user consent.

## Phase 9 - Password Analyzer

Goal: Add local password safety checks.

Tasks:

- Detect password input events without storing raw value.
- Estimate password strength locally.
- Store local salted/HMAC password fingerprint for reuse detection.
- Add optional HIBP k-anonymity check.

Acceptance criteria:

- Password reuse warning works locally.
- Raw password never appears in logs, storage, backend, or console.

## Phase 10 - Cookie Analyzer

Goal: Detect insecure cookie configurations.

Tasks:

- Request optional cookie permission.
- Read cookie metadata.
- Hash cookie names before storage.
- Score missing `Secure`, `HttpOnly`, `SameSite`.
- Show cookie health in dashboard.

Acceptance criteria:

- Cookie values are never stored.
- Dashboard shows cookie risk by domain.

## Phase 11 - Extension Scanner

Goal: Detect risky installed extensions.

Tasks:

- Request optional `management` permission.
- List installed extensions.
- Score permissions.
- Score broad host access.
- Detect sideloaded/development install type.
- Detect version changes.
- Show exposure map.

Acceptance criteria:

- User can enable extension scanner.
- Dashboard lists risky permissions with explanations.
- UI clearly says this is exposure analysis, not proof of stealing data.

## Phase 12 - AI Chatbot and Reports

Goal: Add user-friendly explanations and weekly summaries.

Tasks:

- Build evidence-to-explanation endpoint.
- Build dashboard chatbot panel.
- Build weekly report generator.
- Add export as JSON and PDF/HTML later.

Chatbot constraints:

- Only explain structured evidence.
- Do not make independent security verdicts.
- Do not receive raw passwords/cookies.

Acceptance criteria:

- User can ask "Why is this risky?"
- Weekly report shows alerts, top risky domains, risky downloads, cookie issues, extension risks, and recommended actions.

## Phase 13 - Evaluation and Final Report

Goal: Make it look like a strong academic/project submission.

Evaluation metrics:

- Precision.
- Recall.
- F1.
- PR-AUC.
- False positive rate.
- Recall at fixed false positive rate.
- Model calibration.
- p95 page-analysis latency.
- p95 backend latency.
- Privacy leakage checks.

Experiments:

- URL-only baseline vs evidence-fusion model.
- Normal login pages vs fake login pages.
- Same-domain login vs cross-domain credential submit.
- Static form vs dynamically injected form.
- Logo-original phishing vs modified-logo phishing.
- CAPTCHA-gated page re-analysis after manual completion.
- Benign top domains from Tranco.

Acceptance criteria:

- `docs/EVALUATION_PLAN.md` defines datasets and methodology.
- Results are reproducible.
- Final report does not overclaim production-grade protection.

## 7. Implementation Order

Recommended order:

1. Documentation foundation.
2. Extension scaffold.
3. Local evidence engine.
4. FormGuard.
5. Popup and dashboard alert UI.
6. FastAPI backend.
7. URL AI model.
8. BrandGuard text model.
9. Download scanner.
10. Extension scanner.
11. Cookie analyzer.
12. Password analyzer.
13. Chatbot.
14. Weekly reports.
15. Evaluation and final polish.

Do not start with all AI models. Build the rule/evidence engine first, because it creates useful data and makes the project demonstrable early.

## 8. First Sprint Checklist

Sprint goal: Get an installable extension that analyzes the current page and shows a trust score.

Tasks:

- Create `extension/` React/Vite app.
- Add MV3 `manifest.json`.
- Add content script.
- Add service worker.
- Add popup UI.
- Add local scoring engine.
- Detect:
  - HTTPS or HTTP.
  - URL length.
  - suspicious TLD.
  - password field presence.
  - form action domain mismatch.
- Show:
  - trust score.
  - verdict.
  - top reasons.
- Add 2 local test pages:
  - benign login page.
  - fake phishing page with cross-domain form.

Definition of done:

- Extension loads in Chrome.
- Popup displays current page score.
- Fake test page triggers high-risk warning.
- No raw password collection.

## 9. Second Sprint Checklist

Sprint goal: Make FormGuard strong.

Tasks:

- Add `MutationObserver`.
- Track dynamic form injection.
- Track form action changes.
- Detect iframe login forms.
- Detect hidden password fields.
- Create event timeline.
Overview:

- Deliver a small FastAPI app scaffold in `backend/` that can be run locally for development and testing.
- Provide clear API specs, request/response examples, and a required-dependencies list so frontend/extension teams can integrate quickly.
- Ensure privacy rules are enforced: no raw passwords, cookies, or full page bodies are accepted by default.

Files to create (suggested):

- `backend/app/main.py` — FastAPI application and route registration.
- `backend/app/config.py` — load environment variables and app configuration.
- `backend/app/api/__init__.py` — router registry.
- `backend/app/api/health.py` — `/health` endpoint.
- `backend/app/api/analyze.py` — `/api/v1/analyze/url` and related endpoints.
- `backend/app/api/evidence.py` — `/api/v1/evidence` ingestion endpoint.
- `backend/app/db/client.py` — MongoDB connection helper.
- `backend/requirements.txt` — pinned Python dependencies.
- `backend/.env.example` — environment variable examples.
- `backend/tests/test_health.py` — simple pytest to validate startup.

Minimal example `app/main.py` (for docs only — create file later):

```python
from fastapi import FastAPI
from app.api.health import router as health_router
from app.api.analyze import router as analyze_router
from app.api.evidence import router as evidence_router

def create_app() -> FastAPI:
    app = FastAPI(title="Secure Browser Backend")
    app.include_router(health_router)
    app.include_router(analyze_router, prefix="/api/v1")
    app.include_router(evidence_router, prefix="/api/v1")
    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
```

Example `backend/requirements.txt` (docs):

```
fastapi>=0.95
uvicorn[standard]>=0.22
python-dotenv>=1.0
pymongo>=4.2
pydantic>=2.0
pytest>=8.0
```

Example `backend/.env.example` (docs):

```text
SECURE_BROWSER_ENV=development
SECURE_BROWSER_MONGODB_URI=mongodb://localhost:27017
SECURE_BROWSER_DB_NAME=secure_browser
SECURE_BROWSER_VT_API_KEY=
SECURE_BROWSER_ALLOWED_ORIGINS=http://localhost:5173,chrome-extension://EXTENSION_ID
```

Primary endpoints (detailed contract):

- `GET /health`
  - Response: `{ "status": "ok" }`

- `POST /api/v1/analyze/url`
  - Request: `{ "url": "https://example.com/login", "redirectChain": ["https://r1","https://r2"] }`
  - Response: `{ "urlRisk": 0.63, "features": { ... }, "modelVersion": "url-xgb-v1" }`

- `POST /api/v1/evidence`
  - Request: sanitized evidence object (no raw secrets):
    ```json
    {
      "clientId": "local-anonymous-id",
      "pageEvidence": {
        "urlHash": "sha256-url-hash",
        "hostname": "example.com",
        "signals": { },
        "scores": { },
        "reasons": []
      }
    }
    ```
  - Response: `{ "stored": true, "serverRisk": 0.72, "recommendations": [ ... ] }`

- `POST /api/v1/reputation/virustotal/url` and `/file-hash`
  - Proxy endpoints for backend-only VirusTotal lookups (API key always server-side).

- `GET /api/v1/reports/weekly`
  - Response: weekly report JSON for client (requires client id filter).

- `POST /api/v1/chat/explain`
  - Request: `{ "question": "Why is this risky?", "evidence": { ... } }`
  - Response: `{ "answer": "..." }` (structured explanation, no new raw data accepted)

Database collections (mapping):

- `page_analyses` — sanitized per-page evidence + scores + model_versions
- `alerts` — generated alerts with severity and reasons
- `events` — optional audit log of ingestion and API calls (no raw secrets)
- `downloads`, `cookie_findings`, `password_findings`, `extension_findings`, `weekly_reports`, `model_versions`

Security & privacy rules (enforced by backend):

- Reject ingestion requests that contain raw password values, cookie values, or full page HTML bodies.
- Validate and sanitize all incoming fields; store only hashes or metadata where appropriate.
- Rate-limit and authenticate sensitive endpoints; by default allow anonymous ingest with `clientId` but require auth for report retrieval.

Run & dev commands (docs):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Testing (quick sanity):

```bash
cd backend
pytest -q
```

Acceptance criteria (expanded):

- `uvicorn app.main:app --reload` starts the backend without startup errors.
- `GET /health` returns `{ "status": "ok" }`.
- `POST /api/v1/evidence` accepts a sanitized evidence payload and stores a record in `page_analyses` (or `events`) in MongoDB.
- `POST /api/v1/analyze/url` returns a URL risk object (initially rule-based values are acceptable).
- VirusTotal-related endpoints do not expose the API key to clients and return results only from server-side queries.

Notes and next steps:

- After this doc change, the next practical step is to scaffold the `backend/` files listed above and add one or two minimal endpoints (`/health`, `/api/v1/evidence`) to validate the integration with the extension.
- If you want, I can now create the backend scaffold files and run the tests locally.
- Improve alert UI with evidence.

Definition of done:

- Dynamically injected fake login form is detected.
- Alert explains exactly what changed on the page.

## 10. Third Sprint Checklist

Sprint goal: Add backend and persistence.

Tasks:

- Create FastAPI backend.
- Add MongoDB connection.
- Add evidence submission endpoint.
- Add VirusTotal URL lookup endpoint.
- Add `.env.example`.
- Add backend tests.

Definition of done:

- Extension can send sanitized evidence.
- Backend stores event.
- VirusTotal key remains backend-only.

## 11. Fourth Sprint Checklist

Sprint goal: Add machine learning baseline.

Tasks:

- Download/prepare URL datasets.
- Extract URL features.
- Train baseline model.
- Train XGBoost model.
- Save model and metadata.
- Create backend inference endpoint.
- Add evaluation notebook/script.

Definition of done:

- Backend returns ML URL risk.
- Report shows baseline vs XGBoost metrics.

## 12. Privacy and Security Rules

Follow these rules throughout the project:

- Never store raw passwords.
- Never send raw passwords.
- Never store cookie values.
- Never send cookie values.
- Do not upload downloaded files automatically.
- VirusTotal API key must stay in backend only.
- Use explicit consent for external scans.
- Store sanitized evidence, not full browsing history.
- Keep model explanations evidence-based.
- Avoid remotely hosted executable code in the extension.
- Use optional permissions for cookies and extension scanning.
- Clearly explain permission usage to the user.

## 13. Chrome MV3 Constraints

Important limitations:

- MV3 service workers are event-driven and can stop when idle, so do not rely on in-memory state.
- Use `chrome.storage` or backend storage for persistent state.
- Most extensions cannot use blocking `webRequest` in MV3.
- Use `declarativeNetRequest` for rule-based blocking.
- Use warning pages or overlays for AI-based alerts.
- Extension cannot reliably inspect all runtime behavior of other extensions.
- `management` API gives metadata about extensions, not complete source/runtime behavior.

## 14. API Design

### POST `/api/v1/evidence`

Request:

```json
{
  "clientId": "local-anonymous-id",
  "pageEvidence": {
    "urlHash": "sha256-url-hash",
    "hostname": "example.com",
    "signals": {},
    "scores": {},
    "reasons": []
  }
}
```

Response:

```json
{
  "stored": true,
  "serverRisk": 0.72,
  "recommendations": [
    "Do not enter credentials on this page."
  ]
}
```

### POST `/api/v1/analyze/url`

Request:

```json
{
  "url": "https://example.com/login",
  "redirectChain": []
}
```

Response:

```json
{
  "urlRisk": 0.63,
  "features": {
    "urlLength": 25,
    "usesHttps": true,
    "subdomainCount": 0
  },
  "modelVersion": "url-xgb-v1"
}
```

### POST `/api/v1/chat/explain`

Request:

```json
{
  "question": "Why is this risky?",
  "evidence": {
    "verdict": "high_risk",
    "reasons": [
      "Password form submits to a different domain"
    ]
  }
}
```

Response:

```json
{
  "answer": "This page is risky because it asks for a password but sends the form to a different domain."
}
```

## 15. Database Design

### `page_analyses`

Fields:

- `_id`
- `client_id`
- `timestamp`
- `hostname`
- `url_hash`
- `signals`
- `scores`
- `verdict`
- `reasons`
- `model_versions`

### `alerts`

Fields:

- `_id`
- `client_id`
- `timestamp`
- `alert_type`
- `severity`
- `hostname`
- `title`
- `reasons`
- `resolved`

### `downloads`

Fields:

- `_id`
- `client_id`
- `timestamp`
- `filename_hash`
- `source_hostname`
- `danger_state`
- `risk_score`
- `user_consented_external_scan`

### `extension_findings`

Fields:

- `_id`
- `client_id`
- `timestamp`
- `extension_id_hash`
- `name`
- `permissions`
- `host_permissions`
- `install_type`
- `enabled`
- `risk_score`
- `reasons`

### `weekly_reports`

Fields:

- `_id`
- `client_id`
- `week_start`
- `week_end`
- `summary`
- `top_risks`
- `recommendations`

## 16. Model Plan

### URL XGBoost

Inputs:

- URL lexical features.
- Hostname features.
- Redirect features.
- Reputation features.

Output:

- `urlRisk` from 0 to 1.

### BERT/DistilBERT Text Classifier

Inputs:

- Sanitized title.
- Sanitized headings.
- Sanitized form labels.
- Sanitized button text.

Output:

- `textPhishingRisk` from 0 to 1.
- `claimedBrand` if possible.

### CNN or Embedding Visual Model

Inputs:

- Screenshot or cropped logo area.

Output:

- `visualBrandRisk`.
- `possibleBrand`.

### Fusion Model

Inputs:

- URL risk.
- Form risk.
- Brand risk.
- Text risk.
- Visual risk.
- Reputation risk.

Output:

- Final trust score.
- Risk verdict.
- Explanation reasons.

Start simple:

```text
finalRisk = max(formRisk, brandRisk * 0.9, urlRisk * 0.75, reputationRisk)
trustScore = round(100 - finalRisk * 100)
```

Improve later with calibrated fusion.

## 17. Datasets and Feeds

Use only data allowed by each source's terms.

Phishing:

- PhishTank: https://www.phishtank.net/
- OpenPhish: https://openphish.com/

Malware/download URLs:

- URLhaus: https://urlhaus.abuse.ch/

Benign domains:

- Tranco: https://tranco-list.eu/

Password breach check:

- HIBP Pwned Passwords: https://haveibeenpwned.com/Passwords

Reputation:

- VirusTotal API: https://docs.virustotal.com/reference/overview

## 18. Research Papers to Cite

Phishing and brand detection:

- PhishIntention, USENIX Security 2022: https://www.usenix.org/conference/usenixsecurity22/presentation/liu-ruofan
- PhishLLM, USENIX Security 2024: https://www.usenix.org/conference/usenixsecurity24/presentation/liu-ruofan
- Phishpedia, USENIX Security 2021: https://www.usenix.org/conference/usenixsecurity21/presentation/lin
- LogoMorph, USENIX Security 2024: https://www.usenix.org/conference/usenixsecurity24/presentation/hao-qingying
- PhishDecloaker, USENIX Security 2024: https://www.usenix.org/conference/usenixsecurity24/presentation/teoh

Extension security:

- Hulk, USENIX Security 2014: https://www.usenix.org/conference/usenixsecurity14/technical-sessions/presentation/kapravelos
- WebEval, USENIX Security 2015: https://www.usenix.org/conference/usenixsecurity15/technical-sessions/presentation/jagpal
- Arcanum, USENIX Security 2024: https://www.usenix.org/conference/usenixsecurity24/presentation/xie-qinge

## 19. Official Technical Resources

Chrome extension:

- Manifest V3: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- Service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Declarative Net Request: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Web Request: https://developer.chrome.com/docs/extensions/reference/api/webRequest
- Management API: https://developer.chrome.com/docs/extensions/reference/api/management
- Downloads API: https://developer.chrome.com/docs/extensions/reference/api/downloads
- Cookies API: https://developer.chrome.com/docs/extensions/reference/api/cookies

Frontend:

- React: https://react.dev/
- Vite: https://vite.dev/

Backend:

- FastAPI: https://fastapi.tiangolo.com/
- MongoDB Python: https://www.mongodb.com/docs/languages/python/

ML:

- TensorFlow: https://www.tensorflow.org/
- TensorFlow.js: https://www.tensorflow.org/js
- XGBoost: https://xgboost.readthedocs.io/
- Hugging Face Transformers: https://huggingface.co/docs/transformers/
- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/
- scikit-learn metrics: https://scikit-learn.org/stable/modules/model_evaluation.html

Testing:

- Playwright: https://playwright.dev/
- pytest: https://docs.pytest.org/

## 20. Environment Setup

Recommended versions:

- Node.js 20+
- npm 10+
- Python 3.11+
- Chrome latest stable
- MongoDB local or MongoDB Atlas

Backend `.env.example`:

```text
SECURE_BROWSER_ENV=development
SECURE_BROWSER_MONGODB_URI=mongodb://localhost:27017
SECURE_BROWSER_DB_NAME=secure_browser
SECURE_BROWSER_VT_API_KEY=
SECURE_BROWSER_ALLOWED_ORIGINS=http://localhost:5173,chrome-extension://EXTENSION_ID
```

## 21. Development Commands

These commands are targets for implementation. They may not work until the folders are created.

Extension:

```bash
cd extension
npm install
npm run dev
npm run build
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

ML:

```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python training/train_url_model.py
python evaluation/evaluate_url_model.py
```

Tests:

```bash
cd backend
pytest

cd extension
npm test
npm run build
```

## 22. Demo Scenarios

Build local test pages for safe demonstrations:

1. Benign login page.
2. Fake Microsoft login page on wrong domain.
3. Password form posting to cross-origin URL.
4. Login form injected after 3 seconds.
5. Login form inside iframe.
6. HTTP page asking for password.
7. Suspicious download filename.
8. Cookie missing security flags.
9. Extension with broad permissions.

Never test with real live phishing pages on your main browser profile.

## 23. Final Submission Deliverables

Code:

- Chrome extension.
- Backend API.
- ML training scripts.
- Test pages.

Documentation:

- README.
- Threat model.
- Privacy design.
- API spec.
- Evaluation plan.
- Research notes.
- Final report.

Demo:

- Install extension.
- Visit benign test page.
- Visit fake phishing test page.
- Show real-time alert.
- Open dashboard.
- Show evidence graph.
- Ask chatbot why page is risky.
- Generate weekly report.

## 24. Quality Checklist

Before final submission:

- Extension installs without errors.
- Popup works.
- Dashboard works.
- Service worker persists state correctly.
- Content script does not collect raw secrets.
- Backend starts cleanly.
- MongoDB connection works.
- VirusTotal key is not exposed in frontend.
- Test phishing pages trigger warnings.
- Benign pages do not trigger excessive false positives.
- README explains setup.
- Privacy doc is clear.
- Evaluation metrics are included.

## 25. Best Next Step

Start implementation with:

1. Create docs foundation.
2. Scaffold extension.
3. Build local evidence engine.
4. Build FormGuard.

This creates a working, impressive prototype fast and gives the AI models clean evidence to improve later.
