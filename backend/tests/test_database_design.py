import json
from datetime import date, timedelta

from backend.app.db.repository import (
    DatabaseRepository,
    derive_page_alert,
    hash_sensitive_value,
    normalize_page_analysis_payload,
)
from backend.app.models.database import (
    DownloadDocument,
    ExtensionFindingDocument,
    PHASE_15_COLLECTIONS,
    PageAnalysisDocument,
    WeeklyReportDocument,
)


def test_phase_15_collection_fields_match_plan():
    assert PHASE_15_COLLECTIONS["page_analyses"] == [
        "_id",
        "client_id",
        "timestamp",
        "hostname",
        "url_hash",
        "signals",
        "scores",
        "verdict",
        "reasons",
        "model_versions",
    ]
    assert PHASE_15_COLLECTIONS["alerts"] == [
        "_id",
        "client_id",
        "timestamp",
        "alert_type",
        "severity",
        "hostname",
        "title",
        "reasons",
        "resolved",
    ]
    assert PHASE_15_COLLECTIONS["downloads"] == [
        "_id",
        "client_id",
        "timestamp",
        "filename_hash",
        "source_hostname",
        "danger_state",
        "risk_score",
        "user_consented_external_scan",
    ]
    assert PHASE_15_COLLECTIONS["extension_findings"] == [
        "_id",
        "client_id",
        "timestamp",
        "extension_id_hash",
        "name",
        "permissions",
        "host_permissions",
        "install_type",
        "enabled",
        "risk_score",
        "reasons",
    ]
    assert PHASE_15_COLLECTIONS["weekly_reports"] == [
        "_id",
        "client_id",
        "week_start",
        "week_end",
        "summary",
        "top_risks",
        "recommendations",
    ]


def test_page_analysis_normalizes_legacy_payload_and_hashes_url():
    raw_url = "https://login.example.test/account?token=raw-secret"
    document = normalize_page_analysis_payload(
        {
            "clientId": "client-a",
            "pageEvidence": {
                "url": raw_url,
                "timestamp": "2026-08-31T10:30:00+00:00",
                "signals": {"hasPasswordField": True},
                "scores": {"finalTrustScore": 15},
                "reasons": [{"message": "Password form submits to another domain"}],
                "modelVersions": {"fusion": "rules-v1"},
            },
        }
    )

    payload = document.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert payload["client_id"] == "client-a"
    assert payload["hostname"] == "login.example.test"
    assert payload["url_hash"] == hash_sensitive_value(raw_url)
    assert "url" not in payload
    assert payload["verdict"] == "high_risk"
    assert payload["reasons"] == ["Password form submits to another domain"]
    assert payload["model_versions"] == {"fusion": "rules-v1"}


def test_repository_writes_phase_15_jsonl_collections(tmp_path):
    repository = DatabaseRepository(data_dir=tmp_path, use_mongo=False)
    page_analysis = PageAnalysisDocument(
        client_id="client-a",
        hostname="example.test",
        url_hash="abc123",
        signals={"hasPasswordField": True},
        scores={"finalTrustScore": 10},
        verdict="high_risk",
        reasons=["Suspicious form"],
        model_versions={"url": "url-rules-v1"},
    )
    analysis_id = repository.insert_page_analysis(page_analysis)
    alert = derive_page_alert(page_analysis)
    alert_id = repository.insert_alert(alert)
    download_id = repository.insert_download(
        DownloadDocument(
            client_id="client-a",
            filename_hash="file-hash",
            source_hostname="downloads.example.test",
            danger_state="dangerous",
            risk_score=0.88,
            user_consented_external_scan=False,
        )
    )
    extension_id = repository.insert_extension_finding(
        ExtensionFindingDocument(
            client_id="client-a",
            extension_id_hash="extension-hash",
            name="Sample Extension",
            permissions=["tabs"],
            host_permissions=["<all_urls>"],
            install_type="development",
            enabled=True,
            risk_score=0.7,
            reasons=["Broad host access"],
        )
    )
    week_start = date.today() - timedelta(days=date.today().weekday())
    report_id = repository.upsert_weekly_report(
        WeeklyReportDocument(
            client_id="client-a",
            week_start=week_start,
            week_end=week_start + timedelta(days=6),
            summary="1 high-risk page.",
            top_risks=[{"reason": "Suspicious form", "count": 1}],
            recommendations=["Review the domain before entering credentials."],
        )
    )

    assert analysis_id
    assert alert_id
    assert download_id
    assert extension_id
    assert report_id

    expected_files = {
        "page_analyses.jsonl",
        "alerts.jsonl",
        "downloads.jsonl",
        "extension_findings.jsonl",
        "weekly_reports.jsonl",
    }
    assert {path.name for path in tmp_path.glob("*.jsonl")} == expected_files

    page_payload = json.loads((tmp_path / "page_analyses.jsonl").read_text(encoding="utf-8").splitlines()[0])
    alert_payload = json.loads((tmp_path / "alerts.jsonl").read_text(encoding="utf-8").splitlines()[0])
    assert list(page_payload.keys()) == sorted(page_payload.keys())
    assert page_payload["client_id"] == "client-a"
    assert page_payload["url_hash"] == "abc123"
    assert alert_payload["severity"] == "critical"
