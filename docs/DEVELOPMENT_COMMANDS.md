# Development Commands

This file collects practical, copy-paste commands for common development tasks across the extension, backend, ML, and testing workflows.

## Prerequisites

- Node.js 20+ and npm 10+ (or pnpm)
- Python 3.11+
- Chrome (latest stable) for extension testing
- Docker & Docker Compose (optional, for MongoDB local via container)

## Environment

Create a Python virtual environment for backend and ML work:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Copy example env for backend:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env to populate SECURE_BROWSER_VT_API_KEY and any other values
```

## Extension (development)

Install and run the Vite dev server (hot reload):

```bash
cd extension
npm install
npm run dev
```

Build the production extension bundle:

```bash
cd extension
npm run build
# The built extension will be in extension/dist (or as configured)
```

Run extension unit tests (if present):

```bash
cd extension
npm test
```

Load the unpacked extension in Chrome via `chrome://extensions` → "Load unpacked" pointing at `extension/dist` or the Vite dev build output.

## Backend (FastAPI)

Install dependencies and run the backend with auto-reload:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Quick health-check:

```bash
curl http://127.0.0.1:8000/health
```

Run backend tests:

```bash
cd backend
source .venv/bin/activate
pytest -q
```

## ML (training & evaluation)

Create and activate a venv, install ML dependencies, and run training/eval scripts:

```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python training/train_url_model.py
python evaluation/evaluate_url_model.py
```

## Docker (optional local MongoDB)

Run MongoDB via Docker Compose (example):

```bash
docker compose up -d mongo
# or use docker-compose.yml at repo root if provided
```

Example `docker-compose.yml` snippet (if you want to add it):

```yaml
version: '3.8'
services:
  mongo:
    image: mongo:6.0
    restart: unless-stopped
    ports:
      - 27017:27017
    volumes:
      - mongo-data:/data/db
volumes:
  mongo-data:
```

## Common developer conveniences

Suggested `Makefile` targets (create `Makefile` at repo root):

```makefile
.PHONY: deps-backend run-backend test-backend deps-extension run-extension build-extension

deps-backend:
	python -m venv backend/.venv && source backend/.venv/bin/activate && pip install -r backend/requirements.txt

run-backend:
	cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

test-backend:
	cd backend && source .venv/bin/activate && pytest -q

deps-extension:
	cd extension && npm install

run-extension:
	cd extension && npm run dev

build-extension:
	cd extension && npm run build
```

## Formatting & linting

Python formatting and linting (examples):

```bash
cd backend
source .venv/bin/activate
pip install black ruff
black .
ruff check .
```

JavaScript formatting with prettier / ESLint (if configured):

```bash
cd extension
npm run lint
npm run format
```

## CI notes

- Make sure tests run in CI with the `backend` venv activated.
- Cache Python packages and npm modules for faster CI runs.
- Do not store secret keys in CI logs; use encrypted secrets for `SECURE_BROWSER_VT_API_KEY`.

## Troubleshooting tips

- If `uvicorn` fails on startup, check `backend/.env` and MongoDB connectivity.
- If extension dev server cannot connect to backend, ensure `SECURE_BROWSER_ALLOWED_ORIGINS` includes `http://localhost:8000` and the extension origin.

## Where to add more commands

If you want, I can add a `dev/README.md` or an actual `Makefile` and `docker-compose.yml`. Ask and I'll implement them.
