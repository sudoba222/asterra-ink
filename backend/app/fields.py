"""Field endpoints."""

import asyncio
import hashlib
import json
import math
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.copernicus import CopernicusClient
from app.errors import ApiError
from app.geometry import area_hectares
from app.schemas import FieldPolygon, NdviPoint, NdviRequest, NdviResponse, TerrainResponse
from app.terrain import SOURCE as TERRAIN_SOURCE
from app.terrain import NasademClient, compute_terrain, read_window, terrain_evidence, tile_name

router = APIRouter(prefix="/fields", tags=["fields"])

SOURCE = "Copernicus Sentinel-2 L2A (ESA), Copernicus Data Space Ecosystem Statistical API"


def get_copernicus(request: Request) -> CopernicusClient:
    return request.app.state.copernicus


def get_nasadem(request: Request) -> NasademClient:
    return request.app.state.nasadem


def _cache_key(body: NdviRequest) -> str:
    raw = json.dumps(
        [
            [[round(lon, 6), round(lat, 6)] for lon, lat in body.polygon],
            str(body.start),
            str(body.end),
            body.interval_days,
        ]
    )
    return "ndvi:" + hashlib.sha256(raw.encode()).hexdigest()


def _round(value: object) -> float | None:
    return round(value, 4) if isinstance(value, int | float) else None


def to_series(raw: dict) -> list[NdviPoint]:
    """Turn the Statistical API answer into one point per interval. Cloudy intervals get ndvi = null."""
    points: list[NdviPoint] = []
    for item in raw.get("data", []):
        interval = item.get("interval", {})
        start = datetime.fromisoformat(interval["from"].replace("Z", "+00:00")).date()
        end = datetime.fromisoformat(interval["to"].replace("Z", "+00:00")).date() - timedelta(days=1)
        stats = item.get("outputs", {}).get("ndvi", {}).get("bands", {}).get("B0", {}).get("stats", {})
        samples = stats.get("sampleCount") or 0
        no_data = stats.get("noDataCount") or 0
        clear = samples - no_data
        has_value = "error" not in item and clear > 0
        points.append(
            NdviPoint(
                start=start,
                end=end,
                ndvi_mean=_round(stats.get("mean")) if has_value else None,
                ndvi_min=_round(stats.get("min")) if has_value else None,
                ndvi_max=_round(stats.get("max")) if has_value else None,
                ndvi_std=_round(stats.get("stDev")) if has_value else None,
                clear_share=round(clear / samples, 3) if samples and has_value else 0.0,
            )
        )
    return points


@router.post("/ndvi", response_model=NdviResponse)
async def field_ndvi(
    body: NdviRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    copernicus: CopernicusClient = Depends(get_copernicus),
) -> NdviResponse:
    """NDVI of a field over time from Sentinel-2 (about every 5 days, cloudy pixels removed).

    NDVI near 0–0.2 = bare soil, 0.2–0.5 = sparse or young crop, above 0.5 = dense green crop.
    """
    assert body.start is not None and body.end is not None  # filled in by NdviRequest
    if (body.end - body.start).days > settings.max_range_days:
        raise ApiError(422, "RANGE_TOO_LONG", f"Ask for at most {settings.max_range_days} days at once.")
    area = area_hectares(body.polygon)
    if area > settings.max_field_hectares:
        raise ApiError(
            422,
            "FIELD_TOO_LARGE",
            f"The field is {area:,.0f} ha; the limit is {settings.max_field_hectares:,.0f} ha.",
        )

    cache = request.app.state.cache
    key = _cache_key(body)
    raw = cache.get(key)
    if raw is None:
        raw = await copernicus.ndvi_statistics(body.polygon, body.start, body.end, body.interval_days)
        # Past periods never change; keep them longer. Periods that include today expire normally.
        ttl = settings.cache_ttl_seconds * (30 if body.end < date.today() else 1)
        cache.set(key, raw, expire=ttl)

    return NdviResponse(
        source=SOURCE,
        area_hectares=round(area, 2),
        interval_days=body.interval_days,
        series=to_series(raw),
    )


@router.post("/terrain", response_model=TerrainResponse)
async def field_terrain(
    body: FieldPolygon,
    request: Request,
    settings: Settings = Depends(get_settings),
    nasadem: NasademClient = Depends(get_nasadem),
) -> TerrainResponse:
    """Slope, height and water-erosion risk of the field from NASA NASADEM (30 m).

    Erosion risk (indicative): high if mean slope ≥ 5 % or ≥ 30 % of the field is steeper than 5 %;
    moderate if mean slope ≥ 2 % or ≥ 10 % is steeper than 5 %; low otherwise.
    """
    area = area_hectares(body.polygon)
    if area > settings.max_field_hectares:
        raise ApiError(
            422,
            "FIELD_TOO_LARGE",
            f"The field is {area:,.0f} ha; the limit is {settings.max_field_hectares:,.0f} ha.",
        )
    key = (
        "terrain:"
        + hashlib.sha256(
            json.dumps([[round(x, 6), round(y, 6)] for x, y in body.polygon]).encode()
        ).hexdigest()
    )
    cache = request.app.state.cache
    cached = cache.get(key)
    if cached is None:
        lons = [p[0] for p in body.polygon]
        lats = [p[1] for p in body.polygon]
        clat, clon = (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
        path = await nasadem.tile_path(tile_name(clat, clon))
        if path is None:
            raise ApiError(404, "NO_ELEVATION_DATA", "NASA has no elevation data here (open water?).")
        window = await asyncio.to_thread(
            read_window, path, math.floor(clat), math.floor(clon), min(lons), min(lats), max(lons), max(lats)
        )
        terrain = compute_terrain(window, body.polygon)
        if terrain is None:
            raise ApiError(404, "NO_ELEVATION_DATA", "No valid elevation pixels under this field.")
        cached = {**terrain.__dict__, "evidence": terrain_evidence(terrain)}
        cache.set(key, cached, expire=settings.cache_ttl_seconds * 30)
    return TerrainResponse(source=TERRAIN_SOURCE, **cached)
