import os
from collections import Counter
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..db.repository import DatabaseRepository
from ..models.database import WeeklyReportDocument

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
EVIDENCE_FILE = os.path.abspath(os.path.join(DATA_DIR, "page_analyses.jsonl"))


class WeeklyReportResponse(BaseModel):
    clientId: str
    weekStart: str
    weekEnd: str
    reportId: str | None = None
    storageBackend: str = "jsonl"
    summary: str
    pageAnalysisCount: int
    verdictCounts: dict[str, int]
    topDomains: list[dict[str, Any]]
    topRisks: list[dict[str, Any]]
    highRiskPages: list[dict[str, Any]]
    alerts: list[dict[str, Any]]
    recommendations: list[str]


def get_repository() -> DatabaseRepository:
    return DatabaseRepository(page_analyses_file=EVIDENCE_FILE)


def _load_recent_analyses(week_start: date, week_end: date, client_id: str | None = None) -> list[dict[str, Any]]:
    return get_repository().list_page_analyses(week_start, week_end, client_id)


def _flatten_reasons(analyses: list[dict[str, Any]]) -> list[str]:
    reasons = []
    for entry in analyses:
        for reason in (entry.get("reasons") or []):
            if isinstance(reason, str):
                reasons.append(reason)
            elif isinstance(reason, dict):
                reasons.append(reason.get("message", ""))
    return [r for r in reasons if r]


def _build_recommendations(analyses: list[dict[str, Any]], verdict_counts: Counter) -> list[str]:
    recommendations = [
        "Review recent pages before entering credentials.",
        "Keep your extension and browser up to date.",
        "Close high-risk pages and avoid entering sensitive data.",
    ]

    high_risk = verdict_counts.get("high_risk", 0)
    if high_risk > 0:
        recommendations.insert(0, f"{high_risk} high-risk page(s) detected this week. Review them before entering any credentials.")

    reasons = _flatten_reasons(analyses)
    if any("cross-origin" in r.lower() or "cross domain" in r.lower() for r in reasons):
        recommendations.append("Check forms that submit to a different domain before entering credentials.")
    if any("http" in r.lower() and "insecure" in r.lower() for r in reasons):
        recommendations.append("Avoid submitting sensitive data over HTTP connections.")
    if any("brand" in r.lower() and "mismatch" in r.lower() for r in reasons):
        recommendations.append("Verify claimed brand pages by typing the URL directly instead of following links.")

    return recommendations[:6]


@router.get("/reports/weekly", response_model=WeeklyReportResponse)
async def get_weekly_report(clientId: str | None = Query(None, max_length=64)) -> dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    report_client_id = clientId or "anonymous"
    repository = get_repository()
    analyses = repository.list_page_analyses(week_start, week_end, report_client_id if clientId else None)

    total_pages = len(analyses)
    verdict_counts = Counter((entry.get("verdict") or "unknown").lower() for entry in analyses)
    top_domains = Counter(entry.get("hostname") or entry.get("origin") or "unknown" for entry in analyses)

    high_risk_pages = [entry for entry in analyses if (entry.get("scores", {}).get("finalTrustScore") or 0) < 20]
    top_reasons = Counter(_flatten_reasons(analyses))

    top_risks = [
        {"reason": reason, "count": count}
        for reason, count in top_reasons.most_common(5)
    ]

    top_domains_by_count = [
        {"hostname": hostname, "count": count}
        for hostname, count in top_domains.most_common(5)
    ]

    alerts = [
        {
            "hostname": entry.get("hostname") or "",
            "urlHash": entry.get("url_hash") or entry.get("urlHash") or "",
            "verdict": entry.get("verdict"),
            "score": entry.get("scores", {}).get("finalTrustScore"),
            "reasons": (entry.get("reasons") or [])[:3],
            "timestamp": entry.get("timestamp"),
        }
        for entry in sorted(
            high_risk_pages,
            key=lambda item: item.get("scores", {}).get("finalTrustScore", 0),
        )
    ][:10]

    if total_pages == 0:
        summary = "No page analyses were recorded this week."
    else:
        summary = (
            f"Analyzed {total_pages} page(s) this week with {verdict_counts.get('high_risk', 0)} high-risk page(s)."
        )

    recommendations = _build_recommendations(analyses, verdict_counts)
    report_id = repository.upsert_weekly_report(
        WeeklyReportDocument(
            client_id=report_client_id,
            week_start=week_start,
            week_end=week_end,
            summary=summary,
            top_risks=top_risks,
            recommendations=recommendations,
        )
    )

    return {
        "clientId": report_client_id,
        "weekStart": week_start.isoformat(),
        "weekEnd": week_end.isoformat(),
        "reportId": report_id,
        "storageBackend": "mongodb" if repository.using_mongo else "jsonl",
        "summary": summary,
        "pageAnalysisCount": total_pages,
        "verdictCounts": dict(verdict_counts),
        "topDomains": top_domains_by_count,
        "topRisks": top_risks,
        "highRiskPages": [
            {
                "hostname": entry.get("hostname") or "",
                "urlHash": entry.get("url_hash") or entry.get("urlHash") or "",
                "verdict": entry.get("verdict"),
                "score": entry.get("scores", {}).get("finalTrustScore"),
            }
            for entry in sorted(high_risk_pages, key=lambda item: item.get("scores", {}).get("finalTrustScore", 0))
        ][:5],
        "alerts": alerts,
        "recommendations": recommendations,
    }
