from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..config import settings
from ..db.repository import DatabaseRepository
from ..model_registry import get_model_version
from ..models.database import ThreatIntelDecisionDocument

router = APIRouter()

THREAT_INTEL_MODEL_VERSION = get_model_version("threat_intel")

SUSPICIOUS_DOMAINS = {
    "evil-login.example",
    "fake-login.example",
    "amazon-signin.example",
    "secure-update.example",
    "microsoft-security-update.example",
    "paypal-account-review.example",
}

SUSPICIOUS_TOKENS = {
    "signin",
    "security",
    "verify",
    "account",
    "review",
    "recover",
    "update",
    "login",
    "payment",
    "confirmation",
}

PROVIDER_LABELS = {
    "virustotal": "VirusTotal",
    "abuseipdb": "AbuseIPDB",
    "phishtank": "PhishTank",
    "microsoft": "Microsoft Defender TI",
    "local": "Local heuristics",
}


class ThreatIntelRequest(BaseModel):
    url: str = Field(..., max_length=2048)
    hostname: str = Field(default="", max_length=253)
    brand: str = Field(default="", max_length=80)
    categories: list[str] = Field(default_factory=list)
    client_id: str | None = Field(default=None, alias="clientId", max_length=128)


class ThreatIntelResponse(BaseModel):
    hostname: str
    source: str
    status: str
    riskScore: float
    categories: list[str]
    reasons: list[str]
    modelVersion: str
    policyAction: str
    trusted: bool
    matches: list[str]
    clientId: str | None = None
    decisionId: str | None = None
    providerBreakdown: dict[str, Any] = Field(default_factory=dict)
    modelMetadata: dict[str, Any] = Field(default_factory=dict)


class ThreatIntelHistoryResponse(BaseModel):
    clientId: str | None = None
    decisions: list[dict[str, Any]] = Field(default_factory=list)


def get_repository() -> DatabaseRepository:
    return DatabaseRepository()


@router.post("/threatintel/lookup", response_model=ThreatIntelResponse)
async def lookup_threat_intel(request: ThreatIntelRequest):
    hostname = normalize_hostname(request.hostname or extract_hostname(request.url))
    brand = normalize_brand(request.brand)
    categories: list[str] = []
    reasons: list[str] = []
    matches: list[str] = []
    client_id = request.client_id or "anonymous"

    if hostname in SUSPICIOUS_DOMAINS:
        categories.append("credential_theft")
        categories.append("brand_impersonation")
        reasons.append(f"{hostname} matches a known suspicious phishing domain")
        matches.append(hostname)

    if any(token in hostname.lower() for token in SUSPICIOUS_TOKENS):
        categories.append("phishing")
        reasons.append("Hostname includes credential or security tokens associated with phishing kits")
        matches.append(hostname)

    if brand and hostname and not hostname.lower().endswith(brand.lower()):
        categories.append("brand_impersonation")
        reasons.append(f"Brand '{brand}' appears to be impersonated by the current domain")

    if request.categories:
        for category in request.categories:
            normalized = str(category).strip().lower()
            if normalized:
                categories.append(normalized)

    categories = dedupe(categories)
    provider_breakdown = await evaluate_provider_breakdown(hostname, brand)
    local_risk = score_risk(hostname, brand, categories)
    provider_risk = sum(float(item.get("riskContribution", 0.0)) for item in provider_breakdown.values()) / max(1, len(provider_breakdown))
    risk_score = max(local_risk, min(1.0, round(local_risk * 0.7 + provider_risk * 0.7 + 0.1, 3)))
    policy_action = classify_policy_action(hostname, risk_score)
    trusted = not bool(categories) or risk_score < 0.45

    status = "safe"
    if risk_score >= 0.8:
        status = "known_phishing"
    elif risk_score >= 0.55:
        status = "suspicious"
    elif categories:
        status = "review"

    if not reasons:
        reasons = ["No known threat-intel indicators matched this host."]

    decision_id = str(uuid.uuid4())
    model_metadata = {
        "version": THREAT_INTEL_MODEL_VERSION,
        "source": "hybrid-threat-feed",
        "providers": list(provider_breakdown.keys()),
        "providerPriority": settings.threat_intel_provider_priority,
    }
    decision = ThreatIntelDecisionDocument(
        client_id=client_id,
        timestamp=datetime.now(timezone.utc),
        hostname=hostname,
        url=request.url,
        brand=brand,
        categories=categories,
        risk_score=risk_score,
        status=status,
        policy_action=policy_action,
        provider_breakdown=provider_breakdown,
        model_metadata=model_metadata,
        decision_id=decision_id,
    )
    repository = get_repository()
    repository.insert_threat_intel_decision(decision)

    return {
        "hostname": hostname,
        "source": "hybrid-threat-feed",
        "status": status,
        "riskScore": round(risk_score, 3),
        "categories": categories[:6],
        "reasons": reasons[:6],
        "modelVersion": THREAT_INTEL_MODEL_VERSION,
        "policyAction": policy_action,
        "trusted": trusted,
        "matches": matches[:6],
        "clientId": client_id,
        "decisionId": decision_id,
        "providerBreakdown": provider_breakdown,
        "modelMetadata": model_metadata,
    }


@router.get("/threatintel/decisions", response_model=ThreatIntelHistoryResponse)
async def get_threat_intel_history(clientId: str | None = None):
    repository = get_repository()
    decisions = repository.list_threat_intel_decisions(client_id=clientId)
    public_decisions = []
    for item in decisions[:25]:
        public_decisions.append({
            "clientId": item.get("client_id") or clientId,
            "hostname": item.get("hostname"),
            "url": item.get("url"),
            "brand": item.get("brand"),
            "categories": item.get("categories", []),
            "riskScore": item.get("risk_score"),
            "status": item.get("status"),
            "policyAction": item.get("policy_action"),
            "providerBreakdown": item.get("provider_breakdown", {}),
            "modelMetadata": item.get("model_metadata", {}),
            "decisionId": item.get("decision_id"),
            "timestamp": item.get("timestamp"),
        })
    return {"clientId": clientId, "decisions": public_decisions}


@router.get("/threatintel/report/export")
async def export_threat_intel_report(clientId: str | None = None):
    repository = get_repository()
    decisions = repository.list_threat_intel_decisions(client_id=clientId)
    summary = {
        "totalDecisions": len(decisions),
        "highRiskCount": sum(1 for item in decisions if str(item.get("status", "")).lower() in {"known_phishing", "suspicious"}),
        "warnCount": sum(1 for item in decisions if str(item.get("status", "")).lower() == "review"),
        "blockCount": sum(1 for item in decisions if str(item.get("policy_action", "")).lower() == "block"),
        "lastUpdated": decisions[0].get("timestamp") if decisions else None,
    }
    providers = list(dict.fromkeys(
        provider_name
        for decision in decisions
        for provider_name in (decision.get("provider_breakdown") or {}).keys()
    ))
    return {
        "clientId": clientId,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "providers": providers,
        "decisions": decisions[:25],
    }


async def evaluate_provider_breakdown(hostname: str, brand: str) -> dict[str, Any]:
    provider_map = {
        "VirusTotal": "virustotal",
        "AbuseIPDB": "abuseipdb",
        "PhishTank": "phishtank",
        "Microsoft Defender TI": "microsoft",
    }

    breakdown: dict[str, Any] = {}
    for label, provider_name in provider_map.items():
        raw = await query_provider_status(provider_name, hostname)
        entry = {
            "provider": label,
            "configured": bool(raw.get("configured", False)),
            "status": raw.get("status", "not_configured"),
            "confidence": float(raw.get("confidence", 0.0)),
            "riskContribution": float(raw.get("riskContribution", 0.0)),
        }
        if "lastCheckedAt" in raw:
            entry["lastCheckedAt"] = raw["lastCheckedAt"]
        breakdown[label] = entry
    return breakdown


async def query_provider_status(provider: str, hostname: str) -> dict[str, Any]:
    provider_key_map = {
        "virustotal": "vt_api_key",
        "abuseipdb": "abuseipdb_api_key",
        "phishtank": "phishtank_api_key",
        "microsoft": "microsoft_ti_api_key",
    }
    api_key = getattr(settings, provider_key_map.get(provider, "vt_api_key"), "")
    if not api_key:
        return {"status": "not_configured", "configured": False, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}

    try:
        if provider == "virustotal":
            response = await _get_json(f"https://www.virustotal.com/api/v3/domains/{hostname}", {"x-apikey": api_key, "accept": "application/json"})
            if response.get("status") == 200:
                return {"status": "reachable", "configured": True, "confidence": 0.84, "riskContribution": 0.16, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}
            return {"status": "http_error", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat(), "statusCode": response.get("status")}

        if provider == "phishtank":
            response = await _post_json("https://checkurl.phishtank.com/checkurl/", {"url": f"https://{hostname}"}, {"apikey": api_key, "accept": "application/json"})
            if response.get("status") == 200:
                return {"status": "reachable", "configured": True, "confidence": 0.82, "riskContribution": 0.18, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}
            return {"status": "http_error", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat(), "statusCode": response.get("status")}

        if provider == "microsoft":
            response = await _get_json(f"https://api.security.microsoft.com/api/ti/indicators?query=domainName='{hostname}'", {"Authorization": f"Bearer {api_key}", "accept": "application/json"})
            if response.get("status") == 200:
                return {"status": "reachable", "configured": True, "confidence": 0.88, "riskContribution": 0.2, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}
            return {"status": "http_error", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat(), "statusCode": response.get("status")}

        if provider == "abuseipdb":
            if not re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", hostname):
                return {"status": "unsupported_for_domain", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}
            response = await _get_json(f"https://api.abuseipdb.com/api/v2/check?ip={hostname}", {"Key": api_key, "accept": "application/json"})
            if response.get("status") == 200:
                return {"status": "reachable", "configured": True, "confidence": 0.76, "riskContribution": 0.15, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}
            return {"status": "http_error", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat(), "statusCode": response.get("status")}
    except httpx.HTTPError:
        return {"status": "unreachable", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}

    return {"status": "unreachable", "configured": True, "confidence": 0.0, "riskContribution": 0.0, "lastCheckedAt": datetime.now(timezone.utc).isoformat()}


async def _get_json(url: str, headers: dict[str, str]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(url, headers=headers)
            return {"status": response.status_code, "body": response.text}
    except httpx.HTTPError:
        return {"status": 0, "body": ""}


async def _post_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            return {"status": response.status_code, "body": response.text}
    except httpx.HTTPError:
        return {"status": 0, "body": ""}


def normalize_hostname(value: str) -> str:
    value = str(value or "").strip().lower()
    value = value.replace("http://", "").replace("https://", "")
    value = value.split("/", 1)[0]
    value = value.split("?", 1)[0]
    value = value.split("#", 1)[0]
    value = value.strip(".")
    if not re.fullmatch(r"[a-z0-9.-]+", value):
        return ""
    return value


def normalize_brand(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9 ]", "", str(value or "")).strip()


def dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        cleaned = str(item).strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def extract_hostname(url: str) -> str:
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if parsed.hostname:
            return parsed.hostname.lower()
    except Exception:
        pass
    return normalize_hostname(url)


def score_risk(hostname: str, brand: str, categories: list[str]) -> float:
    score = 0.12
    if hostname in SUSPICIOUS_DOMAINS:
        score += 0.45
    if any(token in hostname.lower() for token in SUSPICIOUS_TOKENS):
        score += 0.18
    if brand and hostname and not hostname.lower().endswith(brand.lower()):
        score += 0.2
    if categories:
        score += min(0.35, len(categories) * 0.12)
    return max(0.0, min(1.0, round(score, 3)))


def classify_policy_action(hostname: str, risk_score: float) -> str:
    if not hostname:
        return "allow"
    if risk_score >= 0.8:
        return "block"
    if risk_score >= 0.55:
        return "warn"
    return "allow"
