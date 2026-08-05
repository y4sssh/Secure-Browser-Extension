import json
import os
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
EVIDENCE_FILE = os.path.abspath(os.path.join(DATA_DIR, "page_analyses.jsonl"))


def contains_forbidden_text(payload: dict) -> bool:
    txt = json.dumps(payload).lower()
    return any(k in txt for k in ("password", "cookie", "pagebody"))


@router.post("/evidence")
async def ingest_evidence(req: Request):
    payload = await req.json()
    if contains_forbidden_text(payload):
        raise HTTPException(status_code=400, detail="forbidden_raw_values")

    # append sanitized payload to file
    with open(EVIDENCE_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    return {"stored": True, "serverRisk": 0.12, "recommendations": ["Avoid entering credentials on unknown pages."]}
