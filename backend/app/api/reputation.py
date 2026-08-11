from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from ..config import settings

router = APIRouter()


class VirusTotalUrlRequest(BaseModel):
    url: str = Field(..., max_length=2048)


class VirusTotalHashRequest(BaseModel):
    fileHash: str = Field(..., min_length=8, max_length=128)


@router.post("/reputation/virustotal/url")
async def reputation_virustotal_url(request: VirusTotalUrlRequest):
    # In Phase 6 this endpoint returns a lightly stubbed response.
    return {
        "url": request.url,
        "source": "virustotal",
        "detected": False,
        "result": "stubbed",
        "apiKeyConfigured": bool(settings.vt_api_key),
    }


@router.post("/reputation/virustotal/file-hash")
async def reputation_virustotal_file_hash(request: VirusTotalHashRequest):
    return {
        "fileHash": request.fileHash,
        "source": "virustotal",
        "detected": False,
        "result": "stubbed",
        "apiKeyConfigured": bool(settings.vt_api_key),
    }
