import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.api import reports as reports_module


@pytest.fixture(scope="module")
def app_client():
    app = create_app()
    return TestClient(app)


def test_weekly_report_aggregates_evidence(tmp_path, app_client, monkeypatch):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    sample_file = tmp_path / "page_analyses.jsonl"
    sample_analyses = [
        {
            "url": "https://example.com/login",
            "hostname": "example.com",
            "timestamp": (week_start + timedelta(days=1)).isoformat(),
            "verdict": "high_risk",
            "scores": {"finalTrustScore": 15},
            "reasons": ["Password form submits to a different domain"],
        },
        {
            "url": "https://example.com/account",
            "hostname": "example.com",
            "timestamp": (week_start + timedelta(days=2)).isoformat(),
            "verdict": "caution",
            "scores": {"finalTrustScore": 65},
            "reasons": ["Form posts to a different origin"],
        },
    ]

    sample_file.write_text("\n".join(json.dumps(item) for item in sample_analyses), encoding="utf-8")
    monkeypatch.setattr(reports_module, "EVIDENCE_FILE", str(sample_file))

    response = app_client.get("/api/v1/reports/weekly?clientId=test-client")
    assert response.status_code == 200
    body = response.json()
    assert body["clientId"] == "test-client"
    assert body["pageAnalysisCount"] == 2
    assert body["verdictCounts"]["high_risk"] == 1
    assert any(domain["hostname"] == "example.com" for domain in body["topDomains"])
    assert any(risk["reason"].startswith("Password form submits") for risk in body["topRisks"])
    assert "alerts" in body
    assert len(body["alerts"]) == 1
    assert "recommendations" in body
    assert len(body["recommendations"]) >= 1
