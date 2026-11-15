"""ASTERRA backend. Run locally: uv run uvicorn app.main:app --reload"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import diskcache
from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.copernicus import CopernicusClient
from app.errors import install_error_handlers
from app.fields import router as fields_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = app.dependency_overrides.get(get_settings, get_settings)()
    app.state.cache = diskcache.Cache(settings.cache_dir)
    app.state.copernicus = CopernicusClient(settings)
    yield
    app.state.cache.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ASTERRA API",
        version="0.2.0",
        lifespan=lifespan,
        docs_url="/api/v1/docs",
        openapi_url="/api/v1/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    install_error_handlers(app)

    api = APIRouter(prefix="/api/v1")

    @api.get("/health", tags=["system"])
    def health(s: Settings = Depends(get_settings)) -> dict:
        return {
            "status": "ok",
            "environment": s.environment,
            "copernicus": "configured" if s.copernicus_configured else "missing",
        }

    api.include_router(fields_router)
    app.include_router(api)
    return app


app = create_app()
