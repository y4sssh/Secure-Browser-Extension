# Environment Setup

This document describes a reproducible development environment for the project: extension, backend, ML, and testing. Follow only the sections you need.

## Recommended Versions

- Node.js: 20.x (LTS)
- npm: 10+
- Python: 3.11+
- MongoDB: 6.x (or use Docker image `mongo:6`)
- Chrome: latest stable for extension testing

## Extension (frontend) — Quick start

1. Install dependencies:

```bash
cd extension
npm install
```

2. Run development server (Vite):

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

4. Load unpacked extension into Chrome for development:

- Open `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist` (or `extension` depending on your build setup).

Notes:
- Use `activeTab` during development to reduce requested permissions.
- For Playwright UI tests, see `extension/tests` and install Playwright with `npx playwright install`.

## Backend (FastAPI) — Quick start

1. Create and activate venv, install deps:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Set environment variables (example `.env`):

Create `.env` (do not commit) or set env vars in your shell. See `backend/.env.example` for names.

```text
SECURE_BROWSER_ENV=development
SECURE_BROWSER_MONGODB_URI=mongodb://localhost:27017
SECURE_BROWSER_DB_NAME=secure_browser
SECURE_BROWSER_VT_API_KEY=
SECURE_BROWSER_ALLOWED_ORIGINS=http://localhost:5173,chrome-extension://EXTENSION_ID
```

3. Run the server:

```bash
uvicorn app.main:app --reload
```

4. Run backend tests:

```bash
pytest -q
```

## MongoDB (local or Docker)

Local (Debian/Ubuntu):

```bash
sudo apt update
sudo apt install -y mongodb
sudo systemctl enable --now mongodb
```

Using Docker:

```bash
docker run -d --name secure-mongo -p 27017:27017 -v secure-mongo-data:/data/db mongo:6
```

Confirm connection using `mongosh` or your MongoDB client.

## ML Workspace

1. Create venv and install ML dependencies:

```bash
cd ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Training and evaluation scripts live under `ml/training` and `ml/evaluation`.

Notes:
- Prefer GPU-enabled environments for model training. Use Docker images or cloud VMs when needed.
- Store heavy datasets outside the repo and use `ml/data` or a separate dataset mount.

## End-to-end Development Tips

- Start MongoDB, then backend, then extension dev server.
- Use the extension `popup`/`dashboard` during manual testing and the `test-sites/` pages for safe demos.
- Keep secret keys out of the repo; use `.env` files or CI secrets.

## Docker Compose (optional)

Here is an example `docker-compose.yml` to run backend + MongoDB (use only for local dev/demo):

```yaml
version: '3.8'
services:
  mongo:
    image: mongo:6
    ports:
      - '27017:27017'
    volumes:
      - mongo-data:/data/db

  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - '8000:8000'
    environment:
      - SECURE_BROWSER_MONGODB_URI=mongodb://mongo:27017
    depends_on:
      - mongo

volumes:
  mongo-data:
```

## Testing Summary

- Backend unit tests: `pytest` from `backend/`.
- Frontend tests: `npm test` from `extension/` (Playwright/Jest depending on setup).
- E2E: Use Playwright to run the extension UI and `test-sites/` pages in a controlled browser profile.

---

If you'd like, I can also add a short `Makefile` or a root-level `dev/README.md` with copy-paste commands for common workflows.
