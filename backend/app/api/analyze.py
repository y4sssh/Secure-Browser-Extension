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


class TextSnippet(BaseModel):
    source: str = Field(default="text", max_length=32)
    text: str = Field(max_length=160)


class TextAnalyzeRequest(BaseModel):
    pageUrl: str = ""
    claimedBrands: list[str] = Field(default_factory=list, max_length=4)
    snippets: list[TextSnippet] = Field(default_factory=list, max_length=16)
    cloudAiConsent: bool = False


class ChatExplainRequest(BaseModel):
    question: str = Field(max_length=256)
    evidence: dict[str, Any] = Field(default_factory=dict)


@router.post("/analyze/url")
async def analyze_url(req: AnalyzeRequest):
    return predict_url_risk_with_features(req.url, req.redirectChain)


@router.post("/analyze/text")
async def analyze_text(req: TextAnalyzeRequest):
    if not req.cloudAiConsent:
        raise HTTPException(status_code=403, detail="cloud_ai_consent_required")

    snippets = [snippet.model_dump() for snippet in req.snippets]
    if _contains_unsanitized_text(snippets):
        raise HTTPException(status_code=400, detail="unsanitized_text_snippet")

    return predict_text_risk(snippets, req.claimedBrands, req.pageUrl)


@router.post("/chat/explain")
async def chat_explain(req: ChatExplainRequest):
    evidence = req.evidence or {}
    question = (req.question or "").strip().lower()
    verdict = str(evidence.get("verdict", "unknown risk")).replace("_", " ")
    reasons = [r.get("message", r) if isinstance(r, dict) else r for r in (evidence.get("reasons") or [])]
    signals = evidence.get("signals") or {}
    scores = evidence.get("scores") or {}
    url = evidence.get("url") or evidence.get("origin") or "this page"

    if not reasons:
        reasons = ["suspicious signals detected"]

    primary_reason = reasons[0]
    secondary_reasons = reasons[1:4]

    if "what should i do" in question or "what now" in question or "advice" in question:
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
                f"The page claims to be {', '.join(claimed)} but is hosted on {url}. "
                "Brand and domain mismatch is a strong phishing indicator."
            )
        else:
            answer = (
                f"The page is hosted at {url}. Review the trust score and risk reasons before proceeding."
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
