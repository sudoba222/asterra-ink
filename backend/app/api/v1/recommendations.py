from datetime import date

from fastapi import APIRouter

from app.core.errors import ApiError
from app.core.responses import envelope
from app.engine import catalog, pipeline
from app.providers import nasa_power
from app.schemas.fields import AnalyzeRequest, CountryAnalyzeRequest, FieldInput, Questionnaire
from app.services import countries, fields

router = APIRouter(tags=["crops & recommendations"])


# ---------- field level (workflow doc) ----------

@router.post("/fields/profile")
async def field_profile(field: FieldInput):
    """Geometry stats + environmental profile for a farmer-drawn polygon."""
    geo = fields.geometry_stats(field)
    c = geo["centroid"]
    layers: dict = {**fields.PLANNED_LAYERS}
    try:
        daily = await fields.daily_climate(c["latitude"], c["longitude"])
        layers["climate"] = {"status": "available", "source": "NASA POWER",
                             "data": fields.annual_overview(daily)}
    except ApiError as exc:
        layers["climate"] = {"status": "unavailable", "source": "NASA POWER", "error": exc.message}
    status = "available" if layers["climate"]["status"] == "available" else "unavailable"
    return envelope({"field": geo, "layers": layers}, source=["NASA POWER"],
                    status="partial" if status == "available" else status,
                    notes="Climate is sampled at the field centroid on POWER's ~50 km grid.")


async def _analyze(lat: float, lon: float, q: Questionnaire) -> dict:
    daily = None
    climate_status = "available"
    try:
        daily = await fields.daily_climate(lat, lon)
    except ApiError:
        climate_status = "unavailable"  # engine still runs; climate checks become 'unknown'

    def season_for(crop: dict):
        if daily is None or q.planting_date is None:
            return None
        days = sum(crop["seasonDays"]) // 2
        return fields.season_stats(daily, q.planting_date, days)

    result = pipeline.run(q, season_for)
    result["dataQuality"] = {
        "climate": {"status": climate_status, **nasa_power.PROVENANCE},
        **fields.PLANNED_LAYERS,
    }
    return result


@router.post("/recommendations/analyze")
async def analyze_field(req: AnalyzeRequest):
    geo = fields.geometry_stats(req.field)
    c = geo["centroid"]
    result = await _analyze(c["latitude"], c["longitude"], req.questionnaire)
    return envelope({"field": geo, **result}, source=["NASA POWER", "ASTERRA rule engine"],
                    status="partial")


# ---------- country level (API spec section 8) ----------

@router.get("/countries/{code}/crops")
async def list_crops(code: str):
    countries.get_country(code)
    meta = catalog.load()
    return envelope(catalog.crops(), source="ASTERRA crop catalog",
                    status="demo" if meta.get("reviewStatus") != "reviewed" else "available",
                    catalogVersion=meta["version"], notes=meta["_about"])


@router.get("/countries/{code}/crops/{crop_id}")
async def crop_details(code: str, crop_id: str):
    countries.get_country(code)
    return envelope(catalog.get(crop_id), source="ASTERRA crop catalog")


@router.get("/countries/{code}/crop-recommendations")
async def stored_recommendations(code: str):
    countries.get_country(code)
    return envelope([], source="asterra", status="not_configured",
                    notes="No stored recommendations yet; use POST .../analyze")


_SEASON_MONTH_NORTH = {"spring": 4, "summer": 6, "autumn": 9, "fall": 9, "winter": 11}
_PRIORITY_MAP = {"water-efficiency": "water_saving", "soil-health": "soil_health",
                 "profit": "profit", "yield": "yield", "low-risk": "low_risk"}


@router.post("/countries/{code}/crop-recommendations/analyze")
async def analyze_country(code: str, req: CountryAnalyzeRequest):
    """Adapter for the API-spec body; runs the same engine at a regional sample point."""
    point = countries.sample_points(code, req.region_id)[0]
    planting = None
    if req.season:
        month = _SEASON_MONTH_NORTH[req.season]
        if point["latitude"] < 0:  # flip seasons in the southern hemisphere
            month = (month + 6 - 1) % 12 + 1
        planting = date(2000, month, 1)
    priority = next((_PRIORITY_MAP[p] for p in req.priorities if p in _PRIORITY_MAP), None)
    q = Questionnaire(previous_crops=[req.current_crop] if req.current_crop else [],
                      irrigation=req.irrigation, planting_date=planting, priority=priority,
                      soil_type=req.soil_type)
    result = await _analyze(point["latitude"], point["longitude"], q)
    result["location"] = {"type": "regional_sample_point", **point}
    if req.soil_type:
        result["notes"] = ["soilType is recorded but soil rules are not implemented yet."]
    return envelope(result, source=["NASA POWER", "ASTERRA rule engine"], status="partial")
