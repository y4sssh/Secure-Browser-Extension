import re
from typing import Any
from math import isfinite
from urllib.parse import urlparse

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

ALLOWED_PAGE_EVIDENCE_KEYS = {
    "url",
    "urlHash",
    "url_hash",
    "hostname",
    "timestamp",
    "signals",
    "scores",
    "verdict",
    "reasons",
    "modelVersions",
    "model_versions",
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


def _is_valid_url(u: str) -> bool:
    try:
        parsed = urlparse(u)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def _redact_sensitive_strings(value: str) -> str:
    # Replace emails, tokens, phones and long HTML with placeholders
    value = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", value)
    value = TOKEN_PATTERN.sub("[REDACTED_TOKEN]", value)
    value = PHONE_PATTERN.sub("[REDACTED_PHONE]", value)
    if HTML_TAG_PATTERN.search(value) and len(value) > 256:
        return "[REDACTED_HTML]"
    return value


def _sanitize_signals(signals: Any) -> dict[str, Any]:
    if not isinstance(signals, dict):
        return {}
    clean: dict[str, Any] = {}
    for k, v in signals.items():
        key_lower = str(k).lower()
        if any(forbidden in key_lower for forbidden in FORBIDDEN_KEYS):
            continue
        if isinstance(v, str):
            if len(v) > 1024:
                # truncate long strings
                v = v[:1024]
            v = _redact_sensitive_strings(v)
            if contains_forbidden_value(v):
                continue
            clean[k] = v
        elif isinstance(v, (int, float)):
            # keep finite numbers
            if isinstance(v, float) and not isfinite(v):
                continue
            clean[k] = v
        elif isinstance(v, list):
            # shallow sanitize lists
            cleaned_list = []
            for item in v:
                if isinstance(item, str):
                    item = _redact_sensitive_strings(item)
                    if contains_forbidden_value(item):
                        continue
                    cleaned_list.append(item)
                elif isinstance(item, (int, float)):
                    if isinstance(item, float) and not isfinite(item):
                        continue
                    cleaned_list.append(item)
            if cleaned_list:
                clean[k] = cleaned_list
        elif isinstance(v, dict):
            # recurse one level
            nested = _sanitize_signals(v)
            if nested:
                clean[k] = nested
    return clean


@router.post("/evidence", response_model=EvidenceResponse)
async def ingest_evidence(req: EvidenceRequest):
    # Basic model dump and top-level forbidden content check
    payload = req.model_dump(mode="json", by_alias=True, exclude_none=True)
    if contains_forbidden_value(payload):
        raise HTTPException(status_code=400, detail="forbidden_raw_values")

    page_evidence = payload.get("pageEvidence")
    if not isinstance(page_evidence, dict):
        raise HTTPException(status_code=400, detail="missing_page_evidence")

    # Reject unknown or disallowed top-level keys in page evidence
    for key in list(page_evidence.keys()):
        if key not in ALLOWED_PAGE_EVIDENCE_KEYS:
            page_evidence.pop(key, None)

    # Validate URL if present
    url = page_evidence.get("url")
    if url and (not isinstance(url, str) or len(url) > 2048 or not _is_valid_url(url)):
        raise HTTPException(status_code=400, detail="invalid_url")

    # Validate hostname if present
    hostname = page_evidence.get("hostname")
    if hostname and (not isinstance(hostname, str) or len(hostname) > 253):
        raise HTTPException(status_code=400, detail="invalid_hostname")

    # Sanitize signals and scores
    signals = _sanitize_signals(page_evidence.get("signals"))
    raw_scores = page_evidence.get("scores") if isinstance(page_evidence.get("scores"), dict) else {}
    scores: dict[str, Any] = {}
    for k, v in raw_scores.items():
        if isinstance(v, (int, float)):
            # Accept numeric scores, coerce floats to finite values
            if isinstance(v, float) and not isfinite(v):
                continue
            scores[str(k)] = v
        elif isinstance(v, str):
            # try to coerce numeric-like strings
            try:
                num = float(v)
                if isfinite(num):
                    scores[str(k)] = num
            except Exception:
                continue

    # Attach sanitized fields back into payload for normalization
    payload["pageEvidence"] = {**{k: page_evidence.get(k) for k in ("url", "urlHash", "hostname", "timestamp", "verdict", "reasons", "modelVersions") if page_evidence.get(k) is not None}, "signals": signals, "scores": scores}

    page_analysis = normalize_page_analysis_payload(payload)
    repository = get_repository()
    try:
        analysis_id = repository.insert_page_analysis(page_analysis)
    except Exception:
        raise HTTPException(status_code=500, detail="storage_error")

    alert = derive_page_alert(page_analysis)
    alert_id = None
    if alert:
        try:
            alert_id = repository.insert_alert(alert)
        except Exception:
            # if alert insertion fails, keep going but note no alert id
            alert_id = None

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
