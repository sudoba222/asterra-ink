from datetime import date, timedelta

from fastapi import APIRouter, Query

from app.core.errors import BadRequest, NotFound
from app.core.responses import envelope
from app.services import climate
from app.services.timeseries import Interval

router = APIRouter(prefix="/countries/{code}", tags=["climate"])

MAX_RANGE_DAYS = 365 * 15


def _meta_args(meta: dict) -> dict:
    meta = dict(meta)
    return {"source": meta.pop("source"), "status": meta.pop("status", "available"), **meta}


@router.get("/indicators")
async def all_indicators(code: str, region_id: str | None = Query(None, alias="regionId")):
    data, meta = await climate.indicators(code, region_id)
    return envelope(data, **_meta_args(meta))


@router.get("/indicators/{name}")
async def one_indicator(code: str, name: str,
                        region_id: str | None = Query(None, alias="regionId")):
    data, meta = await climate.indicators(code, region_id)
    if name not in data:
        raise NotFound(f"Unknown indicator '{name}'", details={"available": sorted(data)})
    item = data[name]
    meta = {**meta, "status": item["status"]}
    return envelope({name: item}, **_meta_args(meta))


@router.get("/climate/summary")
async def climate_summary(code: str, region_id: str | None = Query(None, alias="regionId")):
    data, meta = await climate.summary(code, region_id)
    return envelope(data, **_meta_args(meta))


@router.get("/climate/{variable}")
async def climate_series(
    code: str,
    variable: str,
    from_: date | None = Query(None, alias="from", description="ISO date, default 1 year ago"),
    to: date | None = Query(None, description="ISO date, default today"),
    interval: Interval = "monthly",
    region_id: str | None = Query(None, alias="regionId"),
):
    to = to or date.today()
    from_ = from_ or (to - timedelta(days=365))
    if (to - from_).days > MAX_RANGE_DAYS:
        raise BadRequest("Date range too large (max 15 years)")
    data, meta = await climate.series(code, variable, from_, to, interval, region_id)
    return envelope(data, **_meta_args(meta))
