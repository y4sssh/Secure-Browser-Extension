# Quality Checklist

This document enumerates quality, security, privacy, testing, and release checks to validate the project before final submission or a public release. Use it as a pre-release gate and an engineering checklist during development sprints.

## High-level goals

- Ensure no sensitive keys or personal data are committed.
- Ensure core functionality works (backend health, extension UI, demo pages).
- Ensure tests and linters pass.
- Ensure reproducibility of ML experiments and models included.
- Ensure privacy rules are enforced (no raw secrets logged or stored).

## Automated checks (CI)

- Unit tests: `cd backend && pytest -q` — pass rate target: 100% for critical modules, overall > 90%.
- Linting: Python `ruff` and `black` formatting enforcement; JS/TS `eslint` and `prettier` where applicable.
- Type checks: (if TypeScript used) `tsc --noEmit`.
- Security scans: run `bandit` (Python) or `npm audit` for obvious vulnerabilities.
- Dependency pinning: `requirements.txt` entries must be reviewed; prefer explicit patch versions for reproducibility.
- CI matrix: run tests on Python 3.11 and Node.js 20.

Example CI job steps (GitHub Actions):

1. Checkout
2. Setup Python 3.11, Node 20
3. Install backend deps, run `pytest`
4. Install frontend deps, run lint & tests
5. Build extension and backend artifacts
6. Run simple backend smoke test (`/health`)

## Manual QA checklist

- Environment
  - [ ] Start MongoDB and backend with `.env` copied from `.env.example`.
  - [ ] Serve `test-sites/` and load the extension unpacked in an isolated profile.
- Core functionality
  - [ ] `GET /health` returns `{ "status": "ok" }`.
  - [ ] Visiting `test-sites/phishing-cross-domain` raises a high-risk alert.
  - [ ] Visiting `test-sites/benign-login` shows low risk.
  - [ ] Download samples trigger download analyzer rules (if enabled).
- Privacy & logging
  - [ ] Confirm no raw passwords, cookies, page bodies, or file contents are present in server logs, DB, or demo artifacts.
  - [ ] `SECURE_BROWSER_VT_API_KEY` is present only in `backend/.env` and not in repo.
- Security
  - [ ] Verify CORS / allowed origins match `SECURE_BROWSER_ALLOWED_ORIGINS`.
  - [ ] Ensure VirusTotal or other API keys are not exposed to frontend bundles.

## Performance & stability checks

- Latency: measure p95 page-analysis latency under a small load (target depends on demo constraints).
- Backend: ensure p95 request latency under 500ms for `/health` and simple analyze routes in local demo environment.
- Resource usage: observe memory and CPU during demo; check service worker lifecycle in MV3.

## ML reproducibility

- Include `ml/models/` or provide `ml/README.md` with exact commands and random seeds to reproduce models.
- Record model metadata: training date, dataset versions, hyperparameters, evaluation metrics (precision, recall, F1, PR-AUC).

## Packaging & release checks

- Build artifacts exist and are included in the release bundle (`extension/dist`, `ml/models/`, `backend/requirements.txt`).
- `README.md` contains clear run and demo instructions.
- `docs/PRIVACY.md` clearly states what is and is not collected and how to opt out.

## Acceptance criteria (final gate)

All of the following must be satisfied for a release candidate:

- Automated CI passes on main branch (tests + lint + build).
- Demo scenarios reproduce expected behavior locally.
- No secrets or personal data in the repository or demo artifacts.
- Documentation is complete for reproducibility and demo instructions.
- ML artifacts are either bundled or reproducible with provided scripts.

## How to run the checks locally

Python/Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
ruff check .
black --check .
```

Extension:

```bash
cd extension
npm install
npm run lint
npm test
npm run build
```

ML:

```bash
cd ml
source .venv/bin/activate
pip install -r requirements.txt
python training/train_url_model.py  # optional reproducibility run
```

## Post-release checklist

- Tag the release and capture SHA(s).
- Publish release artifacts (zip or GitHub release assets).
- Archive demo artifacts and sample reports in `demo-artifacts/`.
- Notify stakeholders and include reproduction instructions.

---

If you'd like, I can:

- Add a CI workflow YAML that implements the automated checks above.
- Create a `scripts/prepare_submission.sh` script that runs lint/tests/build and outputs `submission.zip`.

Which of these should I implement next? 
