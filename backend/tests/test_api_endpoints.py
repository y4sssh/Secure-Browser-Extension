import pytest

from backend.app.api import evidence as evidence_module
from backend.app.api import reports as reports_module
from backend.app.db.repository import DatabaseRepository
from backend.app.main import create_app
from backend.tests.asgi_client import ASGIClient


@pytest.fixture()
def app_client(tmp_path, monkeypatch):
    def test_repository():
        return DatabaseRepository(data_dir=tmp_path, page_analyses_file=tmp_path / "page_analyses.jsonl", use_mongo=False)

    monkeypatch.setattr(evidence_module, "get_repository", test_repository)
    monkeypatch.setattr(reports_module, "get_repository", test_repository)
    app = create_app()
    return ASGIClient(app)


def test_health_endpoint(app_client):
    response = app_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_url_endpoint(app_client):
    payload = {"url": "https://example.com/login", "redirectChain": []}
    response = app_client.post("/api/v1/analyze/url", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "urlRisk" in body
    assert body["features"]["usesHttps"] is True
    assert body["features"]["subdomainCount"] == 0
    assert body["modelVersion"] == "url-rules-v1"


def test_analyze_text_requires_consent(app_client):
    payload = {
        "pageUrl": "https://example.com/login",
        "claimedBrands": ["Microsoft"],
        "snippets": [{"source": "title", "text": "Microsoft sign in"}],
        "cloudAiConsent": False,
    }
    response = app_client.post("/api/v1/analyze/text", json=payload)
    assert response.status_code == 403
    assert response.json()["detail"] == "cloud_ai_consent_required"


def test_analyze_text_endpoint(app_client):
    payload = {
        "pageUrl": "https://login.example.com/account",
        "claimedBrands": ["Microsoft"],
        "snippets": [
            {"source": "title", "text": "Microsoft Account"},
            {"source": "heading", "text": "Verify your credentials now"},
        ],
        "cloudAiConsent": True,
    }
    response = app_client.post("/api/v1/analyze/text", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["textRisk"] >= 0
    assert body["modelVersion"] == "text-rules-v1-distilbert-ready"


def test_chat_explain_endpoint(app_client):
    payload = {
        "question": "Why is this page risky?",
        "evidence": {"verdict": "high_risk", "reasons": ["Password form submits to a different domain"]},
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    assert "answer" in response.json()


def test_chat_explain_handles_what_should_i_do(app_client):
    payload = {
        "question": "What should I do?",
        "evidence": {"verdict": "high_risk", "reasons": ["Suspicious form detected"]},
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "answer" in body
    assert "avoid entering credentials" in body["answer"].lower()


def test_chat_explain_handles_is_it_safe(app_client):
    payload = {
        "question": "Is this safe?",
        "evidence": {"verdict": "trusted", "reasons": []},
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "answer" in body


def test_chat_explain_handles_empty_evidence(app_client):
    payload = {
        "question": "Why is this risky?",
        "evidence": {},
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "answer" in body
    assert len(body["answer"]) > 0


def test_chat_explain_rejects_raw_password_in_evidence(app_client):
    payload = {
        "question": "Why is this risky?",
        "evidence": {"password": "secret123", "verdict": "high_risk"},
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "secret123" not in body.get("answer", "")


def test_chat_explain_rejects_cookie_value_in_evidence(app_client):
    payload = {
        "question": "Why is this risky?",
        "evidence": {"cookie": "session=abc123", "verdict": "high_risk"},
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "session=abc123" not in body.get("answer", "")


def test_chat_explain_allow_lists_evidence_and_omits_full_url_secrets(app_client):
    secret = "SENTINEL-chat-secret-value"
    payload = {
        "question": "Explain the domain risk",
        "evidence": {
            "url": f"https://example.test/account?token={secret}",
            "password": secret,
            "cookie": f"session={secret}",
            "hostname": "signin.example.test",
            "verdict": "high_risk",
            "reasons": [f"token={secret}", "Password form submits to a different domain"],
        },
    }
    response = app_client.post("/api/v1/chat/explain", json=payload)
    assert response.status_code == 200
    answer = response.json()["answer"]
    assert "signin.example.test" in answer
    assert secret not in answer
    assert "/account" not in answer


def test_chat_backend_allows_a_real_chrome_extension_origin(app_client):
    origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    response = app_client.options(
        "/api/v1/chat/explain",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_reputation_virustotal_url_endpoint(app_client):
    payload = {"url": "https://example.com/login"}
    response = app_client.post("/api/v1/reputation/virustotal/url", json=payload)
    assert response.status_code == 200
    assert response.json()["source"] == "virustotal"


def test_reputation_virustotal_file_hash_endpoint(app_client):
    payload = {"fileHash": "d2d2d2d2"}
    response = app_client.post("/api/v1/reputation/virustotal/file-hash", json=payload)
    assert response.status_code == 200
    assert response.json()["fileHash"] == "d2d2d2d2"


def test_weekly_report_endpoint(app_client):
    response = app_client.get("/api/v1/reports/weekly?clientId=test-client")
    assert response.status_code == 200
    body = response.json()
    assert body["clientId"] == "test-client"
    assert "weekStart" in body and "weekEnd" in body
    assert "alerts" in body
    assert "recommendations" in body
    assert isinstance(body["recommendations"], list)


def test_evidence_endpoint_rejects_raw_values(app_client):
    payload = {
        "clientId": "test-client",
        "pageEvidence": {
            "hostname": "example.test",
            "signals": {"passwordFieldCount": 1},
            "scores": {"finalTrustScore": 45},
            "reasons": ["Cross-domain password form"],
        },
    }
    response = app_client.post("/api/v1/evidence", json=payload)
    assert response.status_code == 200
    assert response.json()["stored"] is True


def test_evidence_endpoint_rejects_sensitive_content(app_client):
    payload = {
        "clientId": "test-client",
        "pageEvidence": {
            "hostname": "example.test",
            "signals": {"loginText": "Please enter alice@example.com"},
            "scores": {"finalTrustScore": 90},
            "reasons": ["Sample reason"],
        },
    }
    response = app_client.post("/api/v1/evidence", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "forbidden_raw_values"
