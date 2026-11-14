"""Pure helpers for daily series: combine sample points and roll up to weeks/months.

No interpolation: missing days stay missing, and every aggregated point reports
how many valid days it was built from so the frontend can grey out partial periods.
"""

import calendar
from collections import OrderedDict
from datetime import date, timedelta
from statistics import fmean
from typing import Literal

Interval = Literal["daily", "weekly", "monthly"]
How = Literal["mean", "sum"]


def mean_across_points(series: list[dict[str, float | None]]) -> dict[str, float | None]:
    """Average several daily series (one per sample point) day by day."""
    days = sorted(set().union(*series)) if series else []
    out: dict[str, float | None] = {}
    for d in days:
        vals = [s[d] for s in series if s.get(d) is not None]
        out[d] = fmean(vals) if vals else None
    return out


def _period(d: date, interval: Interval) -> tuple[str, int]:
    """Period label and the number of days a complete period contains."""
    if interval == "daily":
        return d.isoformat(), 1
    if interval == "weekly":
        start = d - timedelta(days=d.weekday())
        return start.isoformat(), 7
    return f"{d.year:04d}-{d.month:02d}", calendar.monthrange(d.year, d.month)[1]


def aggregate(daily: dict[str, float | None], interval: Interval, how: How) -> list[dict]:
    groups: OrderedDict[str, tuple[int, list[float | None]]] = OrderedDict()
    for day in sorted(daily):
        label, expected = _period(date.fromisoformat(day), interval)
        groups.setdefault(label, (expected, []))[1].append(daily[day])

    points = []
    for label, (expected, vals) in groups.items():
        valid = [v for v in vals if v is not None]
        value = None
        if valid:
            value = round(sum(valid) if how == "sum" else fmean(valid), 3)
        points.append({
            "date": label,
            "value": value,
            "validDays": len(valid),
            "expectedDays": expected,
            "complete": len(valid) == expected,
        })
    return points


def aggregated_unit(daily_unit: str, how: How) -> str:
    """mm/day summed over a period becomes mm."""
    return daily_unit.removesuffix("/day") if how == "sum" else daily_unit
