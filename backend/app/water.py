"""Regional water endpoints."""

import asyncio

from fastapi import APIRouter, Depends, Query, Request

from app.config import Settings, get_settings
from app.errors import ApiError
from app.grace import SOURCE, GraceClient, read_cell, water_evidence, water_trend
from app.schemas import WaterTrendResponse

router = APIRouter(prefix="/water", tags=["water"])


def get_grace(request: Request) -> GraceClient:
    return request.app.state.grace


@router.get("/trend", response_model=WaterTrendResponse)
async def regional_water_trend(
    request: Request,
    lat: float = Query(ge=-89.75, le=89.75),
    lon: float = Query(ge=-180, le=180),
    settings: Settings = Depends(get_settings),
    grace: GraceClient = Depends(get_grace),
) -> WaterTrendResponse:
    """Trend of total water stored on and under the land (GRACE/GRACE-FO, ≈300 km), cm per year.

    Status: falling ≤ −0.5 cm/yr, rising ≥ +0.5 cm/yr, stable otherwise.
    """
    key = f"grace:{round(lat * 2) / 2}:{round(lon * 2) / 2}"
    cache = request.app.state.cache
    cached = cache.get(key)
    if cached is None:
        path = await grace.file()
        series = await asyncio.to_thread(read_cell, path, lat, lon)
        trend = water_trend(series)
        if trend is None:
            raise ApiError(404, "NO_WATER_DATA", "GRACE has no land water record here.")
        cached = {
            "start": trend.start,
            "end": trend.end,
            "months": trend.months,
            "trend_cm_per_year": trend.trend_cm_per_year,
            "early_cm": trend.early_cm,
            "late_cm": trend.late_cm,
            "status": trend.status,
            "evidence": water_evidence(trend),
        }
        cache.set(key, cached, expire=settings.cache_ttl_seconds * 7)
    return WaterTrendResponse(source=SOURCE, **cached)
