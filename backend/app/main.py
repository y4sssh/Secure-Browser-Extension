from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .api.health import router as health_router
from .api.analyze import router as analyze_router
from .api.evidence import router as evidence_router
from .api.reputation import router as reputation_router
from .api.reports import router as reports_router


def create_app() -> FastAPI:
    app = FastAPI(title="Secure Browser Backend")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(analyze_router, prefix="/api/v1")
    app.include_router(evidence_router, prefix="/api/v1")
    app.include_router(reputation_router, prefix="/api/v1")
    app.include_router(reports_router, prefix="/api/v1")
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
