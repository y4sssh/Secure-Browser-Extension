# Final Submission Deliverables

This document lists the artifacts, packaging steps, and verification checklist for preparing the project for final submission (academic artifact, demo, or deliverable bundle).

## Artifacts to include

- Code:
  - `extension/` — built extension source and production bundle (`dist`)
  - `backend/` — FastAPI app, `requirements.txt`, `.env.example`
  - `ml/` — training scripts, saved models under `ml/models/`, evaluation notebooks
- Documentation:
  - `README.md` — top-level run & install instructions
  - `docs/IMPLEMENTATION_PLAN.md`
  - `docs/ENVIRONMENT_SETUP.md`
  - `docs/DEVELOPMENT_COMMANDS.md`
  - `docs/DEMO_SCENARIOS.md`
  - `docs/RESEARCH_PAPERS.md`, `docs/TECHNICAL_RESOURCES.md`
- Tests & Datasets:
  - `test-sites/` — local demo pages
  - `backend/tests/`, `extension/tests/`, `ml/evaluation/`
- Demo artifacts & reports:
  - `demo-artifacts/` — sample demo outputs and exported reports

## Packaging steps

Create a reproducible submission archive (example):

```bash
# from repo root
git archive --format=tar --prefix=secure-browser-extension/ HEAD | gzip > submission-source.tar.gz

# or create a curated zip including built extension and models
zip -r submission.zip extension/dist backend ml/models demo-artifacts docs README.md LICENSE
```

For a GitHub release include:

1. Tag the release: `git tag -a v1.0.0 -m "Release v1.0.0"`
2. Push tag: `git push origin v1.0.0`
3. Attach `submission.zip` to the release on GitHub

## Verification & acceptance checklist

- [ ] `uvicorn app.main:app --reload` starts without error and `GET /health` returns `{ "status": "ok" }`.
- [ ] Extension loads (unpacked or `dist`) in an isolated Chrome profile and the popup appears.
- [ ] Demo scenarios under `test-sites/` can be served and reproduce expected alerts (see `docs/DEMO_SCENARIOS.md`).
- [ ] All sensitive keys are absent from the bundle; ensure `.env` values are not committed (`.env.example` OK).
- [ ] ML models required for evaluation are present under `ml/models/` or clear instructions exist to recreate them.
- [ ] Tests run: `cd backend && pytest -q` and `cd extension && npm test` (or documented equivalent).
- [ ] Documentation is complete: installation, run, demo, evaluation, and privacy notes.

## Demo delivery instructions (quick)

1. Start MongoDB (local or Docker).
2. Copy `backend/.env.example` → `backend/.env` and set `SECURE_BROWSER_MONGODB_URI` and `SECURE_BROWSER_VT_API_KEY` if needed.
3. Start backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

4. Serve test pages:

```bash
cd test-sites
python3 -m http.server 8000
```

5. Load extension unpacked (point to `extension/dist` or run Vite dev build).

6. Walk through scenarios in `docs/DEMO_SCENARIOS.md`.

## Privacy & submission notes

- Do not include real secret keys (VirusTotal API key) or personal data in the submission.
- Document any external datasets used and include licensing notes for reproducibility.

If you want, I can: create a `submission/` packaging script that builds the extension, exports models (if present), runs tests, and produces `submission.zip`. Should I add that script? 
