"""Country-level climate series, indicators and summaries, built on NASA POWER."""

import asyncio
from datetime import date, timedelta
from statistics import fmean

from app.providers import nasa_power
from app.services import countries
from app.services.timeseries import Interval, aggregate, aggregated_unit, mean_across_points

# Indicators the API spec asks for that have no implemented source yet.
# They are returned explicitly as not_configured instead of being silently dropped.
PLANNED_INDICATORS = {
    "vegetation": {"unit": "NDVI", "plannedSource": "MODIS / Sentinel-2 NDVI via Earth Engine"},
    "evapotranspiration": {"unit": "mm", "plannedSource": "ECOSTRESS or MODIS MOD16"},
    "water-availability": {"unit": None, "plannedSource": "To be defined (GLDAS / SMAP)"},
}
INDICATOR_VARIABLES = ["temperature", "precipitation", "soil-moisture"]


def _years_before(d: date, years: int) -> date:
    """Same calendar day `years` earlier; Feb 29 falls back to Feb 28."""
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        return d.replace(year=d.year - years, day=28)


async def _point_series(lat: float, lon: float, variables: list[str], start: date,
                        end: date) -> dict[str, dict[str, float | None]]:
    return await nasa_power.fetch_daily(lat, lon, variables, start, end)


async def country_daily(code: str, variables: list[str], start: date, end: date,
                        region_id: str | None = None) -> tuple[dict, list[dict]]:
    """Daily series per variable, averaged across the country's sample points."""
    points = countries.sample_points(code, region_id)
    per_point = await asyncio.gather(*[
        _point_series(p["latitude"], p["longitude"], variables, start, end) for p in points
    ])
    combined = {v: mean_across_points([pp[v] for pp in per_point]) for v in variables}
    return combined, points


def _sampling_meta(points: list[dict]) -> dict:
    return {
        "spatialAggregation": f"mean of {len(points)} agricultural sample point(s)",
        "samplePoints": [{"id": p["id"], "name": p["name"]} for p in points],
    }


async def series(code: str, variable: str, start: date, end: date, interval: Interval,
                 region_id: str | None = None) -> tuple[dict, dict]:
    var = nasa_power.resolve(variable)
    daily, points = await country_daily(code, [variable], start, end, region_id)
    pts = aggregate(daily[variable], interval, var.aggregation)
    data = {
        "variable": variable,
        "label": var.label,
        "unit": aggregated_unit(var.unit, var.aggregation),
        "interval": interval,
        "aggregation": var.aggregation,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "points": pts,
    }
    incomplete = any(not p["complete"] for p in pts)
    meta = {
        **nasa_power.PROVENANCE,
        **_sampling_meta(points),
        "interpolation": "none (missing days are left out and counted in validDays)",
        "status": "delayed" if incomplete else "available",
        **({"notes": var.note} if var.note else {}),
    }
    return data, meta


def _last_complete_month(monthly: list[dict]) -> int | None:
    for i in range(len(monthly) - 1, -1, -1):
        if monthly[i]["complete"]:
            return i
    return None


async def indicators(code: str, region_id: str | None = None,
                     today: date | None = None) -> tuple[dict, dict]:
    """Latest complete month per indicator vs the same month one year earlier.

    Same-month-last-year avoids reporting normal seasonal swings as 'change'.
    """
    today = today or date.today()
    start = date(today.year - 2, today.month, 1)
    daily, points = await country_daily(code, INDICATOR_VARIABLES, start, today, region_id)

    out: dict[str, dict] = {}
    for variable in INDICATOR_VARIABLES:
        var = nasa_power.VARIABLES[variable]
        monthly = aggregate(daily[variable], "monthly", var.aggregation)
        by_month = {p["date"]: p for p in monthly}
        idx = _last_complete_month(monthly)
        if idx is None:
            out[variable] = {"value": None, "status": "unavailable", "source": "NASA POWER"}
            continue
        cur = monthly[idx]
        y, m = map(int, cur["date"].split("-"))
        prev = by_month.get(f"{y - 1:04d}-{m:02d}")
        prev_val = prev["value"] if prev and prev["complete"] else None
        change = change_pct = None
        if prev_val is not None and cur["value"] is not None:
            change = round(cur["value"] - prev_val, 3)
            # Percent change explodes on tiny baselines (e.g. 2 mm -> 15 mm = +554%),
            # so the frontend should prefer `change` for precipitation.
            if prev_val != 0:
                change_pct = round(change / abs(prev_val) * 100, 2)
        out[variable] = {
            "value": cur["value"],
            "unit": aggregated_unit(var.unit, var.aggregation),
            "period": cur["date"],
            "previousValue": prev_val,
            "previousPeriod": prev["date"] if prev else None,
            "comparison": "same month, previous year",
            "change": change,
            "changePercent": change_pct,
            "source": "NASA POWER",
            "valueKind": "modeled",
            "status": "available",
            **({"notes": var.note} if var.note else {}),
        }
    for name, info in PLANNED_INDICATORS.items():
        out[name] = {"value": None, "unit": info["unit"], "status": "not_configured",
                     "plannedSource": info["plannedSource"]}

    meta = {**nasa_power.PROVENANCE, **_sampling_meta(points),
            "status": "partial"}  # partial while planned indicators are not wired
    return out, meta


async def summary(code: str, region_id: str | None = None,
                  today: date | None = None, baseline_years: int = 4) -> tuple[dict, dict]:
    """Last 12 months vs the average of the previous `baseline_years` 12-month windows."""
    today = today or date.today()
    end = today - timedelta(days=7)  # skip POWER latency so the window is complete
    start = _years_before(end, baseline_years + 1) + timedelta(days=1)
    daily, points = await country_daily(code, INDICATOR_VARIABLES, start, end, region_id)

    def window_value(values: dict[str, float | None], w_start: date, w_end: date, how: str):
        vals = [v for d, v in values.items()
                if v is not None and w_start.isoformat() <= d <= w_end.isoformat()]
        if not vals:
            return None
        return round(sum(vals) if how == "sum" else fmean(vals), 2)

    windows = []
    for k in range(baseline_years + 1):
        w_end = _years_before(end, k)
        w_start = _years_before(w_end, 1) + timedelta(days=1)
        windows.append((w_start, w_end))

    trends = {}
    for variable in INDICATOR_VARIABLES:
        var = nasa_power.VARIABLES[variable]
        recent = window_value(daily[variable], *windows[0], var.aggregation)
        base_vals = [window_value(daily[variable], *w, var.aggregation) for w in windows[1:]]
        base_vals = [b for b in base_vals if b is not None]
        baseline = round(fmean(base_vals), 2) if base_vals else None
        anomaly = round(recent - baseline, 2) if None not in (recent, baseline) else None
        trends[variable] = {
            "recent": recent,
            "baseline": baseline,
            "anomaly": anomaly,
            "unit": aggregated_unit(var.unit, var.aggregation) if var.aggregation == "sum"
            else var.unit,
            "statistic": "12-month total" if var.aggregation == "sum" else "12-month mean",
            "recentPeriod": {"from": windows[0][0].isoformat(), "to": windows[0][1].isoformat()},
            "baselinePeriod": {"from": windows[-1][0].isoformat(),
                               "to": windows[1][1].isoformat(),
                               "years": len(base_vals)},
            "valueKind": "calculated",
        }
    meta = {**nasa_power.PROVENANCE, **_sampling_meta(points),
            "method": f"Recent 12 months vs mean of previous {baseline_years} 12-month windows"}
    return trends, meta
