# Demo Scenarios

This document describes safe, local demo scenarios you can run to exercise the extension, backend, and evaluation flows. Each scenario includes a brief description, how to run it locally, and acceptance criteria.

## Running the test pages

The repository contains a set of local test pages under `test-sites/`. The easiest way to serve them locally is with Python's simple HTTP server:

```bash
cd test-sites
python3 -m http.server 8000
# Open http://localhost:8000/ in your browser
```

When served this way, scenario pages are reachable at:

- http://localhost:8000/benign-login/
- http://localhost:8000/phishing-cross-domain/
- http://localhost:8000/injected-form/
- http://localhost:8000/iframe-login/
- http://localhost:8000/download-samples/

If you prefer, open the HTML files directly in a disposable browser profile, but prefer the served approach for consistent origins.

## Scenarios

1) Benign login page
- Path: `test-sites/benign-login/index.html`
- Purpose: Verify the extension recognizes a normal login flow as low risk.
- How to run: Serve `test-sites/` and open the URL above.
- Acceptance: Popup shows low risk, no cross-origin form warnings, and no urgent alert.

2) Fake brand login on wrong domain
- Path: `test-sites/brandguard-google/index.html` (or similar files)
- Purpose: Validate BrandGuard detects claimed brand mismatch.
- Acceptance: Evidence shows claimed brand ≠ domain and a medium/high brandRisk.

3) Cross-origin credential submit
- Path: `test-sites/phishing-cross-domain/index.html`
- Purpose: Validate FormGuard detects a form that posts to a different domain.
- Acceptance: Form risk is high; dashboard/popup lists "form posts to different domain" reason.

4) Dynamically injected login form
- Path: `test-sites/injected-form/index.html`
- Purpose: Exercise `MutationObserver` re-analysis when a form appears after page load.
- Acceptance: After injection, extension re-scores the page and raises the appropriate alert.

5) Login form inside iframe
- Path: `test-sites/iframe-login/frame.html` (or top-level index that contains iframe)
- Purpose: Ensure iframe login detection and appropriate explanations.
- Acceptance: Evidence notes `iframeLogin: true` and explains cross-origin/frame concerns.

6) Suspicious download filename
- Path: `test-sites/download-samples/` (serve sample files)
- Purpose: Trigger download scanner rules (double-extension, wrong MIME, RTL override).
- How to run: Click the sample download links while extension has download permission enabled.
- Acceptance: Download is flagged with appropriate risk reasons; no file data is uploaded without consent.

7) Cookie security flags demo
- Purpose: Demonstrate cookie analyzer findings (missing `Secure`, `HttpOnly`, `SameSite`).
- How to run: Use the provided test pages to set insecure cookies or use browser devtools to create them.
- Acceptance: Dashboard lists cookie health by domain; cookie values are not stored.

8) Extension exposure demo
- Purpose: Show the extension scanner reporting installed extension metadata and permission risks.
- How to run: Enable the optional `management` permission in a dev build and open the scanner UI.
- Acceptance: Installed extensions appear with hashed IDs and risk scores; no sensitive data is exposed.

## Automating demos

- You can script scenario runs with Playwright or Selenium to open pages, interact with forms, and capture extension behavior. Use `extension` dev server + Playwright tests to automate.

Example quick-play command to serve pages and backend simultaneously (two terminals):

```bash
# Terminal 1: serve test pages
cd test-sites && python3 -m http.server 8000

# Terminal 2: run backend (see docs/DEVELOPMENT_COMMANDS.md)
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload
```

## Checklist for a demo run

- [ ] Start backend (if using server-side analyze endpoints).
- [ ] Serve `test-sites/` on `localhost`.
- [ ] Load extension (unpacked) or run Vite dev build.
- [ ] Open scenario page and observe popup/dashboard for expected alerts.
- [ ] Verify backend stores sanitized evidence (if enabled) and that no raw secrets are present.

## Notes & safety

- Never load real phishing pages in your main browser profile. Use an isolated/testing profile.
- The test pages are intentionally simplified for demonstration; real-world pages may exhibit more complex behaviors.

If you want, I can also scaffold Playwright scenario tests that exercise each of these pages and assert acceptance criteria. Ask and I'll add them under `extension/tests/` or a `tests/e2e/` folder.
