"""Field geometry + environmental profile for one farmer field."""

from datetime import date, timedelta

from pyproj import Geod
from shapely.geometry import shape
from shapely.validation import explain_validity

from app.core.errors import BadRequest
from app.providers import nasa_power
from app.schemas.fields import FieldInput

_GEOD = Geod(ellps="WGS84")
MAX_FIELD_HA = 10_000
CLIMATE_YEARS = 5
SEASON_VARIABLES = ["temperature", "temperature-min", "precipitation"]

# Optional layers from the workflow doc's five-source core. They must never block analysis.
PLANNED_LAYERS = {
    "ndvi": {"source": "Sentinel-2 / MODIS via Earth Engine", "status": "not_configured"},
    "soilMoisture": {"source": "NASA SMAP (regional)", "status": "not_configured"},
    "terrain": {"source": "SRTM slope/elevation", "status": "not_configured"},
    "cropSuitability": {"source": "FAO GAEZ v4", "status": "not_configured"},
}


def geometry_stats(field: FieldInput) -> dict:
    geom = shape(field.geometry.model_dump())
    if not geom.is_valid:
        raise BadRequest("Field polygon is invalid", details=explain_validity(geom))
    lon_min, lat_min, lon_max, lat_max = geom.bounds
    if not (-180 <= lon_min <= lon_max <= 180 and -90 <= lat_min <= lat_max <= 90):
        raise BadRequest("Coordinates must be [longitude, latitude] in degrees")
    area_m2, _ = _GEOD.geometry_area_perimeter(geom)
    area_ha = abs(area_m2) / 10_000
    if area_ha > MAX_FIELD_HA:
        raise BadRequest(f"Field is {area_ha:,.0f} ha; max supported is {MAX_FIELD_HA:,} ha")
    c = geom.centroid
    return {
        "centroid": {"latitude": round(c.y, 6), "longitude": round(c.x, 6)},
        "areaHa": round(area_ha, 2),
        "bbox": [lon_min, lat_min, lon_max, lat_max],
    }


async def daily_climate(lat: float, lon: float, today: date | None = None) -> dict:
    """~6 years of daily data at the field centroid: enough for 5 full past seasons."""
    today = today or date.today()
    end = today - timedelta(days=5)
    start = date(end.year - CLIMATE_YEARS - 1, 1, 1)
    return await nasa_power.fetch_daily(lat, lon, SEASON_VARIABLES, start, end)


def season_stats(daily: dict, planting: date, season_days: int,
                 years: int = CLIMATE_YEARS) -> dict | None:
    """Average season climate over the last `years` seasons with complete data.

    For each past year, takes the window [planting month/day, + season_days].
    """
    temps, tmins, precip = daily["temperature"], daily["temperature-min"], daily["precipitation"]
    last_day = max(d for d, v in temps.items() if v is not None)
    per_year = []
    year = date.fromisoformat(last_day).year
    while len(per_year) < years and year > 1980:
        try:
            start = planting.replace(year=year)
        except ValueError:  # Feb 29
            start = planting.replace(year=year, day=28)
        end = start + timedelta(days=season_days - 1)
        year -= 1
        if end.isoformat() > last_day:
            continue
        days = [(start + timedelta(days=i)).isoformat() for i in range(season_days)]
        if days[0] not in temps:
            break  # ran past the start of the fetched data
        valid_t = [temps[d] for d in days if temps.get(d) is not None]
        if len(valid_t) < 0.9 * season_days:
            continue
        p = [precip[d] for d in days if precip.get(d) is not None]
        frost = sum(1 for d in days if (tmins.get(d) is not None and tmins[d] < 0))
        per_year.append({
            "season": f"{days[0]}..{days[-1]}",
            "meanTempC": sum(valid_t) / len(valid_t),
            "precipMm": sum(p),
            "frostDays": frost,
        })
    if not per_year:
        return None
    n = len(per_year)
    return {
        "meanTempC": round(sum(y["meanTempC"] for y in per_year) / n, 1),
        "precipMm": round(sum(y["precipMm"] for y in per_year) / n, 0),
        "frostDays": round(sum(y["frostDays"] for y in per_year) / n, 1),
        "seasonsUsed": [y["season"] for y in per_year],
    }


def annual_overview(daily: dict) -> dict:
    """Simple last-full-year climate snapshot for the profile endpoint."""
    temps, precip = daily["temperature"], daily["precipitation"]
    last_day = max(d for d, v in temps.items() if v is not None)
    year = date.fromisoformat(last_day).year - 1
    t = [v for d, v in temps.items() if d.startswith(str(year)) and v is not None]
    p = [v for d, v in precip.items() if d.startswith(str(year)) and v is not None]
    return {
        "year": year,
        "meanTempC": round(sum(t) / len(t), 1) if t else None,
        "totalPrecipMm": round(sum(p), 0) if p else None,
        "validDays": len(t),
        "latestDataDate": last_day,
    }
