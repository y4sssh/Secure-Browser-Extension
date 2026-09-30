import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ml.url_model_stub import predict_url_risk_with_features
from ml.text_model_stub import predict_text_risk

router = APIRouter()


class AnalyzeRequest(BaseModel):
    url: str
    redirectChain: list[str] = Field(default_factory=list)


class AnalyzeUrlResponse(BaseModel):
    urlRisk: float
    features: dict[str, Any]
    modelVersion: str


class TextSnippet(BaseModel):
    source: str = Field(default="text", max_length=32)
    text: str = Field(max_length=160)


class TextAnalyzeRequest(BaseModel):
    pageUrl: str = ""
    claimedBrands: list[str] = Field(default_factory=list, max_length=4)
    snippets: list[TextSnippet] = Field(default_factory=list, max_length=16)
    cloudAiConsent: bool = False


class TextAnalyzeResponse(BaseModel):
    textRisk: float
    features: dict[str, Any]
    reasons: list[str]
    modelVersion: str


class ChatExplainRequest(BaseModel):
    question: str = Field(max_length=256)
    evidence: dict[str, Any] = Field(default_factory=dict)


class ChatExplainResponse(BaseModel):
    answer: str


CHAT_SIGNAL_KEYS = {
    "https",
    "hasPasswordField",
    "formPostsCrossOrigin",
    "formPostsCrossDomain",
    "formPostsToHttp",
    "insecurePasswordSubmit",
    "hiddenPasswordField",
    "hiddenCredentialField",
    "autocompleteDisabled",
    "antiAnalysis",
    "delayedPasswordField",
    "formActionChanged",
    "iframeLogin",
    "loginOverlay",
    "brandDomainMismatch",
    "redirectCount",
    "textRisk",
}
CHAT_VERDICTS = {"trusted", "caution", "risky", "high_risk"}
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
SECRET_PATTERN = re.compile(r"\b(?:password|passcode|passwd|cookie|session|token|authorization)\s*[:=]\s*\S+", re.I)
LONG_TOKEN_PATTERN = re.compile(r"\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b", re.I)


def _redact_chat_text(value: Any, max_length: int = 240) -> str:
    text = " ".join(str(value or "").split())
    text = EMAIL_PATTERN.sub("[email]", text)
    text = SECRET_PATTERN.sub("[redacted]", text)
    text = LONG_TOKEN_PATTERN.sub("[redacted]", text)
    return text[:max_length]


def _safe_chat_evidence(raw_evidence: dict[str, Any]) -> dict[str, Any]:
    """Allow-list only the assistant signals; never retain raw page content."""
    raw = raw_evidence if isinstance(raw_evidence, dict) else {}
    hostname = str(raw.get("hostname") or "").lower().strip()
    hostname = hostname if re.fullmatch(r"[a-z0-9.-]{1,253}", hostname) else ""
    verdict = str(raw.get("verdict") or "unknown")
    verdict = verdict if verdict in CHAT_VERDICTS else "unknown"
    raw_scores = raw.get("scores") if isinstance(raw.get("scores"), dict) else {}
    try:
        trust_score = int(raw_scores.get("finalTrustScore") or 0)
    except (TypeError, ValueError):
        trust_score = 0
    scores = {
        "finalTrustScore": max(0, min(100, trust_score)),
    }
    raw_signals = raw.get("signals") if isinstance(raw.get("signals"), dict) else {}
    signals = {
        key: value
        for key, value in raw_signals.items()
        if key in CHAT_SIGNAL_KEYS and isinstance(value, (bool, int, float))
    }
    reasons = [
        _redact_chat_text(reason.get("message") if isinstance(reason, dict) else reason)
        for reason in (raw.get("reasons") or [])
        if isinstance(reason, (str, dict))
    ]
    claimed_brands = [
        re.sub(r"[^A-Za-z0-9 .&-]", "", str(brand)).strip()[:80]
        for brand in (raw.get("claimedBrands") or [])
        if isinstance(brand, str)
    ]
    return {
        "hostname": hostname,
        "verdict": verdict,
        "scores": scores,
        "signals": signals,
        "reasons": [reason for reason in reasons if reason][:4],
        "claimedBrands": [brand for brand in claimed_brands if brand][:4],
    }


@router.post("/analyze/url", response_model=AnalyzeUrlResponse)
async def analyze_url(req: AnalyzeRequest):
    return predict_url_risk_with_features(req.url, req.redirectChain)


@router.post("/analyze/text", response_model=TextAnalyzeResponse)
async def analyze_text(req: TextAnalyzeRequest):
    if not req.cloudAiConsent:
        raise HTTPException(status_code=403, detail="cloud_ai_consent_required")

    snippets = [snippet.model_dump() for snippet in req.snippets]
    if _contains_unsanitized_text(snippets):
        raise HTTPException(status_code=400, detail="unsanitized_text_snippet")

    return predict_text_risk(snippets, req.claimedBrands, req.pageUrl)


@router.post("/chat/explain", response_model=ChatExplainResponse)
async def chat_explain(req: ChatExplainRequest):
    evidence = _safe_chat_evidence(req.evidence)
    question = (req.question or "").strip().lower()
    verdict = str(evidence.get("verdict", "unknown risk")).replace("_", " ")
    reasons = evidence.get("reasons") or []
    signals = evidence.get("signals") or {}
    scores = evidence.get("scores") or {}
    hostname = evidence.get("hostname") or "this page"

    if not reasons:
        reasons = ["suspicious signals detected"]

    primary_reason = reasons[0]
    secondary_reasons = reasons[1:4]
    has_direct_risk = any(
        keyword in primary_reason.lower() or any(keyword in str(reason).lower() for reason in secondary_reasons)
        for keyword in ["cross", "domain", "login", "password", "download", "cookie", "extension", "phish", "brand", "malware", "suspicious", "risk"]
    )

    if verdict in {"trusted", "caution"} and not has_direct_risk:
        answer = (
            "This page does not currently show a strong direct phishing or form-abuse signal, but website risk is broader than one page. "
            "Common risks include fake login pages, brand impersonation, unsafe cookies, malicious downloads, password reuse, and over-permissioned browser extensions. "
            f"For {hostname}, verify the exact domain, only use pages reached from trusted bookmarks or direct navigation, and never enter credentials on a page that looks unexpected."
        )
    elif "what should i do" in question or "what now" in question or "advice" in question:
        answer = (
            f"This page is considered {verdict}. {primary_reason} "
            "Avoid entering credentials, verify the site's domain directly, "
            "and close the page if you are unsure."
        )
    elif "is this safe" in question or "safe" in question:
        if verdict == "high risk" or verdict == "risky":
            answer = (
                f"This page is not considered safe. It is flagged as {verdict} because: {primary_reason}. "
                "Do not enter sensitive information here."
            )
        else:
            answer = (
                f"This page is currently considered {verdict}. "
                "While it does not show strong risk signals, always verify the domain and be cautious with sensitive data."
            )
    elif "why" in question or "because" in question or "reason" in question:
        answer = f"This page is considered {verdict}. {primary_reason}"
        if secondary_reasons:
            answer += " Additional signals: " + "; ".join(secondary_reasons) + "."
    elif "form" in question or "login" in question:
        if signals.get("formPostsCrossOrigin") or signals.get("crossDomain"):
            answer = (
                "A login or password form on this page submits to a different domain than the page itself. "
                "This is a common phishing technique. Do not enter credentials."
            )
        else:
            answer = (
                "No cross-origin form submission was detected, but the page still shows other risk signals. "
                "Review the verdict and reasons above before entering any data."
            )
    elif "domain" in question or "url" in question or "brand" in question:
        claimed = evidence.get("claimedBrands") or []
        if claimed:
            answer = (
                f"The page claims to be {', '.join(claimed)} but is hosted on {hostname}. "
                "Brand and domain mismatch is a strong phishing indicator."
            )
        else:
            answer = (
                f"The page is hosted at {hostname}. Review the trust score and risk reasons before proceeding."
            )
    else:
        answer = f"This page is considered {verdict}. {primary_reason}"
        if secondary_reasons:
            answer += " Other signals include: " + "; ".join(secondary_reasons) + "."

    return {"answer": answer}


def _contains_unsanitized_text(snippets: list[dict]) -> bool:
    combined = " ".join(str(snippet.get("text", "")) for snippet in snippets)
    return bool(
        re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", combined, re.I)
        or re.search(r"\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b", combined)
        or re.search(r"\b\+?\d[\d\s().-]{3,}\d\b", combined)
    )
