#!/usr/bin/env python3
"""Minimal demo server for Phase 4 endpoints.

This lightweight server uses only the Python stdlib so you can run
a quick live demo without installing FastAPI/uvicorn.

Endpoints:
- GET  /health -> {"status": "ok"}
- POST /api/v1/evidence -> accepts sanitized JSON evidence, returns stored:true

This file is for demo purposes only and should be replaced by the
real FastAPI app in `backend/app/` during full implementation.
"""
import http.server
import json
import os
from urllib.parse import urlparse

DEMO_PORT = 8001
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)
EVIDENCE_FILE = os.path.join(DATA_DIR, "evidence.jsonl")


class DemoHandler(http.server.BaseHTTPRequestHandler):
    def _set_json(self, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/":
            # simple HTML status page for demo
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html = (
                "<html><head><title>Secure Browser Demo</title></head>"
                "<body><h1>Secure Browser - Demo Backend</h1>"
                "<p>Available endpoints:</p><ul>"
                "<li><a href=\"/health\">/health</a></li>"
                "<li>POST <code>/api/v1/evidence</code> (JSON)</li>"
                "</ul>"
                "<h2>Send sample evidence</h2>"
                "<form id=\"evidenceForm\">"
                "Client ID: <input id=\"clientId\" value=\"demo-client\" /><br/>"
                "Hostname: <input id=\"hostname\" value=\"example.test\" /><br/>"
                "<button type=\"submit\">Send Evidence</button>"
                "</form>"
                "<pre id=\"resp\" style=\"background:#f6f8fa;padding:8px;border:1px solid #ddd;\"></pre>"
                "<script>"
                "document.getElementById('evidenceForm').addEventListener('submit', async function(e){"
                "  e.preventDefault();"
                "  const clientId = document.getElementById('clientId').value;"
                "  const hostname = document.getElementById('hostname').value;"
                "  const payload = { clientId: clientId, pageEvidence: { hostname: hostname, signals: {}, scores: {}, reasons: [] } };"
                "  try {"
                "    const r = await fetch('/api/v1/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });"
                "    const j = await r.json();"
                "    document.getElementById('resp').textContent = JSON.stringify({ status: r.status, body: j }, null, 2);"
                "  } catch (err) { document.getElementById('resp').textContent = String(err); }"
                "});"
                "</script>"
                "</body></html>"
            )
            self.wfile.write(html.encode())
            return
        if p.path == "/health":
            self._set_json(200)
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        p = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""
        try:
            payload = json.loads(body.decode() or "null")
        except Exception:
            self._set_json(400)
            self.wfile.write(json.dumps({"error": "invalid_json"}).encode())
            return

        # /api/v1/evidence demo ingest
        if p.path == "/api/v1/evidence":
            # basic privacy check: reject if any suspected raw password fields exist
            text = json.dumps(payload).lower()
            if "password" in text or "cookie" in text or "pagebody" in text:
                self._set_json(400)
                self.wfile.write(json.dumps({"error": "forbidden_raw_values"}).encode())
                return

            # append sanitized payload to newline-delimited JSON file
            with open(EVIDENCE_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")

            resp = {"stored": True, "serverRisk": 0.12, "recommendations": ["Avoid entering credentials on unknown pages."]}
            self._set_json(201)
            self.wfile.write(json.dumps(resp).encode())
            return

        # unknown POST
        self._set_json(404)
        self.wfile.write(json.dumps({"error": "not_found"}).encode())


def run():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", DEMO_PORT), DemoHandler)
    print(f"Demo server listening on http://127.0.0.1:{DEMO_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down demo server")
        server.server_close()


if __name__ == "__main__":
    run()
