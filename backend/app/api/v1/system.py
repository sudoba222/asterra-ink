from fastapi import APIRouter

from app.core.config import get_settings
from app.core.responses import envelope
from app.services import data_sources

router = APIRouter(tags=["system"])


@router.get("/health")
async def health():
    s = get_settings()
    return envelope({"status": "ok", "service": s.app_name, "version": s.api_version,
                     "environment": s.environment}, source="asterra")


@router.get("/data-sources")
async def list_data_sources():
    return envelope(data_sources.list_sources(), source="asterra")


@router.get("/data-sources/status")
async def data_sources_status():
    return envelope(await data_sources.status(), source="asterra",
                    notes="Live checks, cached for 5 minutes")
