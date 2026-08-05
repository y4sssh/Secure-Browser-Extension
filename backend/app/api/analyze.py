from fastapi import APIRouter
from pydantic import BaseModel
from ml.url_model_stub import predict_url_risk

router = APIRouter()


class AnalyzeRequest(BaseModel):
    url: str
    redirectChain: list = []


@router.post("/analyze/url")
async def analyze_url(req: AnalyzeRequest):
    # simple rule-based URL risk from ml stub
    score = predict_url_risk(req.url, req.redirectChain)
    return {"urlRisk": score, "features": {"urlLength": len(req.url), "usesHttps": req.url.startswith("https://")}, "modelVersion": "url-stub-v1"}
