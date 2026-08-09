import json
import os
import re
from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
EVIDENCE_FILE = os.path.abspath(os.path.join(DATA_DIR, "page_analyses.jsonl"))

EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
TOKEN_PATTERN = re.compile(r"\b(?:[a-f0-9]{24,}|[A-Za-z0-9+/_=-]{32,})\b")
PHONE_PATTERN = re.compile(r"\b\+?\d[\d\s().-]{3,}\d\b")
HTML_TAG_PATTERN = re.compile(r"<\/?(?:html|body|script|div|span|form|input|textarea|label)[^>]*>", re.I)


def contains_forbidden_value(payload: Any) -> bool:
    if isinstance(payload, dict):
        if any(key.lower() == "pagebody" for key in payload):
            return True
        return any(contains_forbidden_value(value) for value in payload.values())

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


@router.post("/evidence")
async def ingest_evidence(req: Request):
    payload = await req.json()
    if contains_forbidden_value(payload):
        raise HTTPException(status_code=400, detail="forbidden_raw_values")

    with open(EVIDENCE_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    return {
        "stored": True,
        "serverRisk": 0.12,
        "recommendations": [
            "Avoid entering credentials on unknown pages.",
            "Verify the page domain before submitting sensitive data.",
        ],
    }
