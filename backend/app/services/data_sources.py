"""Registry of data sources. A source is only reported 'available' after a live check."""

import asyncio
from datetime import UTC, datetime

from app.core.cache import cached
from app.core.config import get_settings
from app.providers import gibs, nasa_power

# `implemented=False` sources come from the challenge resource list and the team's
# workflow doc; they show up as not_configured until someone wires them up.
SOURCES: list[dict] = [
    {"id": "nasa-power", "name": "NASA POWER", "coverage": "global", "implemented": True,
     "provides": ["temperature", "precipitation", "humidity", "solar-radiation",
                  "soil-moisture (modeled)"]},
    {"id": "nasa-gibs", "name": "NASA GIBS", "coverage": "global", "implemented": True,
     "provides": ["map tiles: true color, NDVI, IMERG precipitation, SMAP soil moisture"]},
    {"id": "smap", "name": "NASA SMAP", "coverage": "global (~9-36 km)", "implemented": False,
     "provides": ["soil moisture values"], "requires": "earthdata_token"},
    {"id": "gpm-imerg", "name": "NASA GPM IMERG", "coverage": "global (~10 km)",
     "implemented": False, "provides": ["precipitation values"], "requires": "earthdata_token"},
    {"id": "srtm", "name": "SRTM", "coverage": "global (30 m)", "implemented": False,
     "provides": ["elevation", "slope"], "requires": "gee_project"},
    {"id": "sentinel-2", "name": "Copernicus Sentinel-2", "coverage": "global (10 m)",
     "implemented": False, "provides": ["NDVI time series per field"], "requires": "gee_project"},
    {"id": "fao-gaez", "name": "FAO GAEZ v4", "coverage": "global", "implemented": False,
     "provides": ["crop suitability", "potential yield"]},
]

_CHECKS = {"nasa-power": nasa_power.check_status, "nasa-gibs": gibs.check_status}


def list_sources() -> list[dict]:
    settings = get_settings()
    out = []
    for s in SOURCES:
        req = s.get("requires")
        out.append({**s, "configured": s["implemented"] and (not req or bool(getattr(settings, req)))})
    return out


@cached("sources:status", ttl=300)
async def status() -> list[dict]:
    async def one(s: dict) -> dict:
        checked_at = datetime.now(UTC).isoformat()
        if not s["configured"] or s["id"] not in _CHECKS:
            return {"id": s["id"], "name": s["name"], "status": "not_configured",
                    "checkedAt": checked_at, "lastSuccessfulUpdate": None}
        result = await _CHECKS[s["id"]]()
        ok = result["status"] == "available"
        return {"id": s["id"], "name": s["name"], **result, "checkedAt": checked_at,
                "lastSuccessfulUpdate": checked_at if ok else None}

    return list(await asyncio.gather(*[one(s) for s in list_sources()]))
