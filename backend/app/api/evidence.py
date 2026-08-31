import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..db.repository import derive_page_alert, normalize_page_analysis_payload
from ..db.repository import DatabaseRepository

router = APIRouter()

EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
TOKEN_PATTERN = re.compile(r"\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b")
PHONE_PATTERN = re.compile(r"\b\+?\d[\d\s().-]{3,}\d\b")
HTML_TAG_PATTERN = re.compile(r"<\/?(?:html|body|script|div|span|form|input|textarea|label)[^>]*>", re.I)
FORBIDDEN_KEYS = {
    "cookie",
    "cookievalue",
    "html",
    "pagebody",
    "pagehtml",
    "password",
    "passwordvalue",
    "rawcookie",
    "rawhtml",
    "rawpassword",
}


class PageEvidence(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    url: str | None = Field(default=None, max_length=2048)
    url_hash: str | None = Field(default=None, alias="urlHash", max_length=128)
    hostname: str | None = Field(default=None, max_length=253)
    timestamp: str | None = None
    signals: dict[str, Any] | None = None
    scores: dict[str, Any] | None = None
    verdict: str | None = Field(default=None, max_length=32)
    reasons: list[Any] | None = None
    model_versions: dict[str, str] | None = Field(default=None, alias="modelVersions")


class EvidenceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_id: str | None = Field(default=None, alias="clientId", max_length=128)
    page_evidence: PageEvidence | None = Field(default=None, alias="pageEvidence")


class EvidenceResponse(BaseModel):
    stored: bool = True
    serverRisk: float = 0.12
    analysisId: str | None = None
    alertId: str | None = None
    storageBackend: str = "jsonl"
    recommendations: list[str] = Field(
        default_factory=lambda: [
            "Avoid entering credentials on unknown pages.",
            "Verify the page domain before submitting sensitive data.",
        ]
    )


def get_repository() -> DatabaseRepository:
    return DatabaseRepository()


def contains_forbidden_value(payload: Any) -> bool:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key.lower().replace("_", "") in FORBIDDEN_KEYS:
                return True
            if contains_forbidden_value(value):
                return True
        return False

    if isinstance(payload, list):
        return any(contains_forbidden_value(item) for item in payload)

    if isinstance(payload, str):
        if EMAIL_PATTERN.search(payload):
            return True
        if TOKEN_PATTERN.search(payload):
            return True
        if PHONE_PATTERN.search(payload):
            return True
        if HTML_TAG_PATTERN.search(payload) and len(payload) > 128:
            return True

    return False


@router.post("/evidence", response_model=EvidenceResponse)
async def ingest_evidence(req: EvidenceRequest):
    payload = req.model_dump(mode="json", by_alias=True, exclude_none=True)
    if contains_forbidden_value(payload):
        raise HTTPException(status_code=400, detail="forbidden_raw_values")

    page_analysis = normalize_page_analysis_payload(payload)
    repository = get_repository()
    analysis_id = repository.insert_page_analysis(page_analysis)
    alert = derive_page_alert(page_analysis)
    alert_id = repository.insert_alert(alert) if alert else None
    trust_score = page_analysis.scores.get("finalTrustScore")
    server_risk = 0.12
    if isinstance(trust_score, (int, float)):
        server_risk = round(max(0.0, min(1.0, (100 - trust_score) / 100)), 2)

    recommendations = [
        "Avoid entering credentials on unknown pages.",
        "Verify the page domain before submitting sensitive data.",
    ]
    if page_analysis.verdict in {"high_risk", "risky"} or alert_id:
        recommendations.insert(0, "Do not enter credentials on this page until you verify the domain.")

    return EvidenceResponse(
        stored=True,
        serverRisk=server_risk,
        analysisId=analysis_id,
        alertId=alert_id,
        storageBackend="mongodb" if repository.using_mongo else "jsonl",
        recommendations=recommendations[:4],
    )
