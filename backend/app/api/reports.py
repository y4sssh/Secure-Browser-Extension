from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/reports/weekly")
async def get_weekly_report(clientId: str | None = Query(None, max_length=64)) -> dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    return {
        "clientId": clientId or "anonymous",
        "weekStart": week_start.isoformat(),
        "weekEnd": week_end.isoformat(),
        "summary": "No critical alerts recorded this week.",
        "topRisks": [],
        "recommendations": [
            "Review recent pages before entering credentials.",
            "Keep your extension and browser up to date.",
        ],
    }
