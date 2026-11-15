"""Regional water-storage trend from NASA/JPL GRACE and GRACE-FO (mascon RL06.3 CRI, monthly, 0.5° grid).

GRACE measures changes in Earth's gravity, i.e. in the total water stored on and under the land:
groundwater, soil moisture, snow and surface water together, over areas of about 300 km. A falling
trend in a farming region often means groundwater is pumped faster than it refills.

The whole record is one ~44 MB netCDF file on NASA PO.DAAC (Earthdata Login token needed). It is
downloaded once per release (monthly) into the cache volume; only one grid cell is read.
"""

import asyncio
import os
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import httpx

from app.config import Settings
from app.errors import ApiError

COLLECTION = "C3195527175-POCLOUD"  # TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4
CMR_URL = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
SOURCE = "NASA/JPL GRACE & GRACE-FO (≈300 km)"
FIRST_LAST_YEARS = 3
STABLE_CM_PER_YEAR = 0.5


@dataclass
class WaterTrend:
    start: date
    end: date
    months: int
    trend_cm_per_year: float
    early_cm: float
    late_cm: float
    status: str  # falling | stable | rising


def water_trend(series: list[tuple[date, float]]) -> WaterTrend | None:
    """Least-squares trend in cm/year plus the mean of the first and last 3 years (anomalies, cm)."""
    pts = sorted(series)
    if len(pts) < 24:
        return None
    xs = [d.year + (d.timetuple().tm_yday - 0.5) / 365.25 for d, _ in pts]
    ys = [v for _, v in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / den if den else 0.0
    start, end = pts[0][0], pts[-1][0]
    early = [v for d, v in pts if d < start + timedelta(days=365 * FIRST_LAST_YEARS)]
    late = [v for d, v in pts if d > end - timedelta(days=365 * FIRST_LAST_YEARS)]
    status = (
        "falling" if slope <= -STABLE_CM_PER_YEAR else "rising" if slope >= STABLE_CM_PER_YEAR else "stable"
    )
    return WaterTrend(
        start=start,
        end=end,
        months=len(pts),
        trend_cm_per_year=round(slope, 2),
        early_cm=round(sum(early) / len(early), 1),
        late_cm=round(sum(late) / len(late), 1),
        status=status,
    )


def water_evidence(t: WaterTrend) -> list[dict[str, str]]:
    period = f"{t.start.year}–{t.end.year}"
    total = round(t.trend_cm_per_year * (t.end.year - t.start.year + 1))
    if t.status == "falling":
        text = (
            "Water stored on and under the land in this region fell about "
            f"{abs(t.trend_cm_per_year)} cm a year ({period}, about {abs(total)} cm in total). "
            "This often means groundwater is used faster than it refills: "
            "crops that need less water are safer for the long term."
        )
    elif t.status == "rising":
        text = (
            f"Water stored on and under the land in this region rose about {t.trend_cm_per_year} cm a year "
            f"({period})."
        )
    else:
        text = f"Water stored on and under the land in this region stayed about the same ({period})."
    return [{"text": text, "source": SOURCE}]


def read_cell(path: Path, lat: float, lon: float) -> list[tuple[date, float]]:
    """Monthly anomalies (cm) at the grid cell nearest to (lat, lon). Applies scale/offset/fill if present."""
    import h5py
    import numpy as np

    with h5py.File(path, "r") as f:
        lats = np.asarray(f["lat"][:], dtype=float)
        lons = np.asarray(f["lon"][:], dtype=float)
        times = np.asarray(f["time"][:], dtype=float)
        var = f["lwe_thickness"]
        lon360 = lon % 360 if lons.max() > 180 else lon
        i = int(np.abs(lats - lat).argmin())
        j = int(np.abs(lons - lon360).argmin())
        values = np.asarray(var[:, i, j], dtype=float)
        attrs = {
            k: (v.item() if hasattr(v, "item") else v)
            for k, v in var.attrs.items()
            if k in ("_FillValue", "scale_factor", "add_offset")
        }
        units = f["time"].attrs.get("units", b"days since 2002-01-01T00:00:00Z")
    units = units.decode() if isinstance(units, bytes) else str(units)
    base = date.fromisoformat(units.split("since")[1].strip()[:10])
    fill = attrs.get("_FillValue")
    out: list[tuple[date, float]] = []
    for t, v in zip(times, values, strict=True):
        if fill is not None and v == fill or not np.isfinite(v):
            continue
        v = v * attrs.get("scale_factor", 1.0) + attrs.get("add_offset", 0.0)
        out.append((base + timedelta(days=float(t)), float(v)))
    return out


class GraceClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self._settings = settings
        self._transport = transport
        self._dir = Path(settings.cache_dir) / "grace"
        self._lock = asyncio.Lock()

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, follow_redirects=True, transport=self._transport)

    async def _latest_url(self) -> str:
        try:
            async with self._client(30) as c:
                res = await c.get(
                    CMR_URL,
                    params={"collection_concept_id": COLLECTION, "sort_key": "-start_date", "page_size": 1},
                )
            items = res.json().get("items", []) if res.status_code == 200 else []
            urls = (
                [u["URL"] for u in items[0]["umm"].get("RelatedUrls", []) if u.get("Type") == "GET DATA"]
                if items
                else []
            )
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
            raise ApiError(502, "NASA_UNREACHABLE", "NASA's data catalog did not answer.") from exc
        if not urls:
            raise ApiError(502, "NASA_ERROR", "NASA's catalog has no GRACE file right now.")
        return urls[0]

    async def file(self) -> Path:
        """Local path of the newest GRACE file; downloads it (removing older ones) when NASA has a new one."""
        if not self._settings.earthdata_configured:
            raise ApiError(
                503, "EARTHDATA_NOT_CONFIGURED", "NASA Earthdata is not set up on this server yet."
            )
        async with self._lock:
            url = await self._latest_url()
            path = self._dir / url.rsplit("/", 1)[-1]
            if path.exists():
                return path
            token = self._settings.earthdata_token.get_secret_value()
            try:
                async with self._client(300) as c:
                    res = await c.get(url, headers={"Authorization": f"Bearer {token}"})
            except httpx.HTTPError as exc:
                raise ApiError(502, "NASA_UNREACHABLE", "NASA PO.DAAC did not answer.") from exc
            if res.status_code in (401, 403):
                raise ApiError(
                    502, "EARTHDATA_AUTH_FAILED", "NASA Earthdata rejected the server's token (expired?)."
                )
            if res.status_code != 200 or not res.content.startswith(b"\x89HDF"):
                raise ApiError(
                    502, "NASA_ERROR", f"NASA PO.DAAC answered {res.status_code} without a GRACE file."
                )
            self._dir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(res.content)
            os.replace(tmp, path)
            for old in self._dir.glob("*.nc"):
                if old != path:
                    old.unlink(missing_ok=True)
            return path
