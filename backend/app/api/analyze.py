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
    verdict = str(evidence.get("verdict", "unknown risk")).replace("_", " ")
    reasons = evidence.get("reasons") or []
    primary_reason = "" if not reasons else reasons[0]
    if isinstance(primary_reason, dict):
        primary_reason = primary_reason.get("message", str(primary_reason))

    if not primary_reason:
        primary_reason = "This page has suspicious signals and should be reviewed carefully."

    answer = f"This page is considered {verdict}. {primary_reason}"

    if "what should i do" in req.question.lower() or "what now" in req.question.lower():
        answer = (
            "This page looks risky. Avoid entering credentials, verify the site's domain, "
            "and close the page if you are unsure."
        )

    return {"answer": answer}


def _contains_unsanitized_text(snippets: list[dict]) -> bool:
    combined = " ".join(str(snippet.get("text", "")) for snippet in snippets)
    return bool(
        re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", combined, re.I)
        or re.search(r"\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b", combined)
        or re.search(r"\b\+?\d[\d\s().-]{3,}\d\b", combined)
    )
