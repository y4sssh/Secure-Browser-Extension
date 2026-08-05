Demo backend (lightweight)
==========================

This is a small, dependency-free demo server to preview Phase 4 endpoints without
installing FastAPI. It is intentionally minimal and should be replaced by the
full FastAPI implementation later.

Run the demo server:

```bash
python3 backend/demo_server.py
```

Endpoints:

- `GET /health` — returns `{ "status": "ok" }`
- `POST /api/v1/evidence` — accepts sanitized JSON evidence (rejects payloads containing the strings `password`, `cookie`, or `pageBody`) and appends to `backend/data/evidence.jsonl`.
