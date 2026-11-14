"""NASA POWER provider: daily point data from the Agroclimatology (AG) community.

Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
Response shape: properties.parameter.<PARAM>.<YYYYMMDD> = value, fill value -999.
Latency: ~2-3 days for meteorology, ~5 days for solar.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

import httpx

from app.core.cache import cached
from app.core.config import get_settings
from app.core.errors import BadRequest, DataSourceUnavailable
from app.core.http import get_json

FILL_VALUE = -999.0
SOURCE_NAME = "NASA POWER"


@dataclass(frozen=True)
class PowerVariable:
    param: str
    unit: str            # unit of the *daily* value
    label: str
    aggregation: Literal["mean", "sum"]  # how to roll daily values into weeks/months
    note: str | None = None


# Public variable names used in our API -> POWER parameter codes.
VARIABLES: dict[str, PowerVariable] = {
    "temperature": PowerVariable("T2M", "°C", "Air temperature at 2 m", "mean"),
    "temperature-max": PowerVariable("T2M_MAX", "°C", "Daily max temperature at 2 m", "mean"),
    "temperature-min": PowerVariable("T2M_MIN", "°C", "Daily min temperature at 2 m", "mean"),
    "precipitation": PowerVariable("PRECTOTCORR", "mm/day", "Precipitation (bias-corrected)", "sum"),
    "humidity": PowerVariable("RH2M", "%", "Relative humidity at 2 m", "mean"),
    "solar-radiation": PowerVariable(
        "ALLSKY_SFC_SW_DWN", "MJ/m²/day", "All-sky surface shortwave radiation", "mean"
    ),
    "soil-moisture": PowerVariable(
        "GWETROOT", "fraction (0-1)", "Root-zone soil wetness", "mean",
        note="MERRA-2 model estimate via POWER, not a SMAP observation; coarse grid, regional.",
    ),
    "surface-soil-moisture": PowerVariable(
        "GWETTOP", "fraction (0-1)", "Surface soil wetness (0-5 cm)", "mean",
        note="MERRA-2 model estimate via POWER, not a SMAP observation; coarse grid, regional.",
    ),
}

PROVENANCE = {
    "source": SOURCE_NAME,
    "product": "POWER Daily API, Agroclimatology community",
    "spatialResolution": "0.5° x 0.625° (MERRA-2 meteorology), 1° (CERES solar)",
    "temporalResolution": "daily",
    "latency": "about 2-5 days",
    "valueKind": "modeled",  # reanalysis / satellite-derived estimate, not a field station
    "url": "https://power.larc.nasa.gov/",
}


def resolve(variable: str) -> PowerVariable:
    try:
        return VARIABLES[variable]
    except KeyError:
        raise BadRequest(
            f"Unknown variable '{variable}'", details={"supported": sorted(VARIABLES)}
        ) from None


async def fetch_daily(lat: float, lon: float, variables: list[str], start: date,
                      end: date) -> dict[str, dict[str, float | None]]:
    """Daily values keyed by our variable name -> ISO date -> value (None = missing)."""
    if end < start:
        raise BadRequest("'to' must be on or after 'from'")
    # POWER's grid is ~0.5°, so rounding to 0.01° loses nothing and improves cache hits.
    return await _fetch_daily_cached(
        round(lat, 2), round(lon, 2), sorted(set(variables)), start.isoformat(), end.isoformat()
    )


@cached("power:daily")
async def _fetch_daily_cached(lat: float, lon: float, variables: list[str], start: str,
                              end: str) -> dict[str, dict[str, float | None]]:
    codes = {resolve(v).param: v for v in variables}
    url = f"{get_settings().nasa_power_base_url}/temporal/daily/point"
    params = {
        "parameters": ",".join(codes),
        "community": "AG",
        "latitude": lat,
        "longitude": lon,
        "start": start.replace("-", ""),
        "end": end.replace("-", ""),
        "format": "JSON",
    }
    try:
        payload = await get_json(url, params)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 422:
            raise BadRequest("NASA POWER rejected the request", details=exc.response.text) from exc
        raise DataSourceUnavailable("NASA POWER is unavailable",
                                    details={"status": exc.response.status_code}) from exc
    except httpx.HTTPError as exc:
        raise DataSourceUnavailable("NASA POWER is unreachable", details=str(exc)) from exc

    raw = payload.get("properties", {}).get("parameter", {})
    out: dict[str, dict[str, float | None]] = {}
    for code, variable in codes.items():
        series = raw.get(code, {})
        out[variable] = {
            f"{k[:4]}-{k[4:6]}-{k[6:]}": (None if v is None or v <= FILL_VALUE else float(v))
            for k, v in series.items()
        }
    return out


async def check_status() -> dict:
    """Cheap live probe used by /data-sources/status."""
    try:
        await get_json(
            f"{get_settings().nasa_power_base_url}/temporal/daily/point",
            {"parameters": "T2M", "community": "AG", "latitude": 0, "longitude": 0,
             "start": "20240101", "end": "20240101", "format": "JSON"},
            attempts=1,
        )
        return {"status": "available"}
    except Exception as exc:  # noqa: BLE001 - status probe must never raise
        return {"status": "unavailable", "detail": type(exc).__name__}
