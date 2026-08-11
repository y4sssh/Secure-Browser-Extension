import json
import os
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
EVIDENCE_FILE = os.path.abspath(os.path.join(DATA_DIR, "page_analyses.jsonl"))


def _safe_parse_line(line: str) -> Any | None:
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def _parse_iso_timestamp(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _load_recent_analyses(week_start: date, week_end: date) -> list[dict[str, Any]]:
    if not os.path.exists(EVIDENCE_FILE):
        return []

    analyses: list[dict[str, Any]] = []
    with open(EVIDENCE_FILE, encoding="utf-8") as f:
        for line in f:
            payload = _safe_parse_line(line.strip())
            if not isinstance(payload, dict):
                continue

            timestamp = _parse_iso_timestamp(payload.get("timestamp") or "")
            if not timestamp:
                continue

            if week_start <= timestamp.date() <= week_end:
                analyses.append(payload)

    return analyses


def _flatten_reasons(analyses: list[dict[str, Any]]) -> list[str]:
    reasons = []
    for entry in analyses:
        for reason in (entry.get("reasons") or []):
            if isinstance(reason, str):
                reasons.append(reason)
            elif isinstance(reason, dict):
                reasons.append(reason.get("message", ""))
    return [r for r in reasons if r]


def _extract_domain(url: str) -> str:
    try:
        return os.path.splitext(os.path.basename(url))[0] if "http" not in url else __import__("urllib.parse").urlparse(url).hostname or ""
    except Exception:
        return ""


@router.get("/reports/weekly")
async def get_weekly_report(clientId: str | None = Query(None, max_length=64)) -> dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    analyses = _load_recent_analyses(week_start, week_end)

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

    if total_pages == 0:
        summary = "No page analyses were recorded this week."
    else:
        summary = (
            f"Analyzed {total_pages} page(s) this week with {verdict_counts.get('high_risk', 0)} high-risk page(s)."
        )

    return {
        "clientId": clientId or "anonymous",
        "weekStart": week_start.isoformat(),
        "weekEnd": week_end.isoformat(),
        "summary": summary,
        "pageAnalysisCount": total_pages,
        "verdictCounts": dict(verdict_counts),
        "topDomains": top_domains_by_count,
        "topRisks": top_risks,
        "highRiskPages": [
            {
                "url": entry.get("url") or entry.get("origin") or "",
                "verdict": entry.get("verdict"),
                "score": entry.get("scores", {}).get("finalTrustScore"),
            }
            for entry in sorted(high_risk_pages, key=lambda item: item.get("scores", {}).get("finalTrustScore", 0))
        ][:5],
        "recommendations": [
            "Review recent pages before entering credentials.",
            "Keep your extension and browser up to date.",
            "Close high-risk pages and avoid entering sensitive data.",
        ],
    }
