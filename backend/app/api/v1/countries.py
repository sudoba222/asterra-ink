from fastapi import APIRouter

from app.core.responses import envelope
from app.services import countries, dashboard

router = APIRouter(prefix="/countries", tags=["countries"])


@router.get("")
async def list_countries():
    return envelope(countries.list_countries(), source="asterra")


@router.get("/{code}")
async def country_details(code: str):
    return envelope(countries.details(code), source="asterra")


@router.get("/{code}/boundaries")
async def country_boundaries(code: str):
    return envelope(countries.boundary(code), source="Natural Earth (public domain)",
                    format="GeoJSON FeatureCollection", scale="1:50m")


@router.get("/{code}/map/regions")
async def country_regions(code: str):
    return envelope(countries.regions(code), source="asterra")


@router.get("/{code}/dashboard")
async def country_dashboard(code: str):
    data = await dashboard.build(code)
    statuses = {s["status"] for s in data["sections"].values()}
    overall = "available" if statuses == {"available"} else "partial"
    return envelope(data, source=["NASA POWER", "NASA GIBS"], status=overall)
