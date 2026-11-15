"""Field slope and erosion risk from NASA NASADEM (SRTM reprocessed, 1 arc-second ≈ 30 m).

NASADEM tiles are 1° × 1° zip files on NASA LP DAAC (Earthdata Login token needed). Each holds a
3601 × 3601 grid of big-endian int16 heights in metres, north row first. A tile is downloaded
once and kept in the cache volume; only the rows under the field are read.

Slope uses Horn's method on the 3 × 3 neighbourhood of every pixel whose centre is inside the
field. Erosion-risk classes are an indicative rule of thumb (water erosion rises sharply above
2–5 % slope), not a soil-loss model.
"""

import asyncio
import io
import math
import os
import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.config import Settings
from app.errors import ApiError
from app.geometry import Point, point_in_ring

SAMPLES = 3601
VOID = -32768
METRES_PER_DEGREE = 111_320.0
SOURCE = "NASA NASADEM (SRTM, 30 m)"


def tile_name(lat: float, lon: float) -> str:
    lat0, lon0 = math.floor(lat), math.floor(lon)
    return f"{'n' if lat0 >= 0 else 's'}{abs(lat0):02d}{'e' if lon0 >= 0 else 'w'}{abs(lon0):03d}"


@dataclass
class Window:
    """Heights for rows/cols [row0, row0 + len(rows)) × [col0, col0 + width) of one tile."""

    lat0: int
    lon0: int
    row0: int
    col0: int
    rows: list[list[int]]


def read_window(
    path: Path, lat0: int, lon0: int, west: float, south: float, east: float, north: float
) -> Window:
    """Reads the field's box plus a 1-pixel margin, clipped to the tile."""
    to_row = lambda lat: (lat0 + 1 - lat) * (SAMPLES - 1)  # noqa: E731
    to_col = lambda lon: (lon - lon0) * (SAMPLES - 1)  # noqa: E731
    r0 = max(0, math.floor(to_row(north)) - 1)
    r1 = min(SAMPLES - 1, math.ceil(to_row(south)) + 1)
    c0 = max(0, math.floor(to_col(west)) - 1)
    c1 = min(SAMPLES - 1, math.ceil(to_col(east)) + 1)
    width = c1 - c0 + 1
    rows: list[list[int]] = []
    with path.open("rb") as f:
        for r in range(r0, r1 + 1):
            f.seek((r * SAMPLES + c0) * 2)
            rows.append(list(struct.unpack(f">{width}h", f.read(width * 2))))
    return Window(lat0, lon0, r0, c0, rows)


@dataclass
class Terrain:
    elevation_m: float
    slope_mean_pct: float
    slope_p90_pct: float
    steep_share: float
    erosion_risk: str
    pixels: int


def erosion_risk(slope_mean_pct: float, steep_share: float) -> str:
    if slope_mean_pct >= 5 or steep_share >= 0.3:
        return "high"
    if slope_mean_pct >= 2 or steep_share >= 0.1:
        return "moderate"
    return "low"


def compute_terrain(w: Window, polygon: list[Point]) -> Terrain | None:
    """Slope (%) and height for pixels whose centre is inside the field; the nearest pixel for tiny fields."""
    step = 1 / (SAMPLES - 1)
    dy = METRES_PER_DEGREE * step

    def pixel(r: int, c: int) -> tuple[float, float] | None:
        """(slope %, height) at window row r, col c, or None at the edge or near voids."""
        if r < 1 or c < 1 or r >= len(w.rows) - 1 or c >= len(w.rows[0]) - 1:
            return None
        z = [[w.rows[r + i][c + j] for j in (-1, 0, 1)] for i in (-1, 0, 1)]
        if any(v == VOID for row in z for v in row):
            return None
        lat = w.lat0 + 1 - (w.row0 + r) * step
        dx = METRES_PER_DEGREE * step * math.cos(math.radians(lat))
        dzdx = ((z[0][2] + 2 * z[1][2] + z[2][2]) - (z[0][0] + 2 * z[1][0] + z[2][0])) / (8 * dx)
        dzdy = ((z[2][0] + 2 * z[2][1] + z[2][2]) - (z[0][0] + 2 * z[0][1] + z[0][2])) / (8 * dy)
        return 100 * math.hypot(dzdx, dzdy), float(z[1][1])

    slopes: list[float] = []
    heights: list[float] = []
    for r in range(len(w.rows)):
        lat = w.lat0 + 1 - (w.row0 + r) * step
        for c in range(len(w.rows[0])):
            lon = w.lon0 + (w.col0 + c) * step
            if not point_in_ring(lon, lat, polygon):
                continue
            p = pixel(r, c)
            if p:
                slopes.append(p[0])
                heights.append(p[1])

    if not slopes:  # field smaller than a pixel: use the pixel nearest to its centre
        clon = sum(p[0] for p in polygon) / len(polygon)
        clat = sum(p[1] for p in polygon) / len(polygon)
        p = pixel(round((w.lat0 + 1 - clat) / step) - w.row0, round((clon - w.lon0) / step) - w.col0)
        if not p:
            return None
        slopes, heights = [p[0]], [p[1]]

    slopes.sort()
    mean = sum(slopes) / len(slopes)
    steep = sum(1 for s in slopes if s > 5) / len(slopes)
    return Terrain(
        elevation_m=round(sum(heights) / len(heights)),
        slope_mean_pct=round(mean, 1),
        slope_p90_pct=round(slopes[min(len(slopes) - 1, int(0.9 * len(slopes)))], 1),
        steep_share=round(steep, 2),
        erosion_risk=erosion_risk(mean, steep),
        pixels=len(slopes),
    )


def terrain_evidence(t: Terrain) -> list[dict[str, str]]:
    advice = {
        "low": "Low water-erosion risk.",
        "moderate": "Moderate erosion risk: plant across the slope and keep crop residue on the field.",
        "high": (
            "High erosion risk: keep the soil covered (cover crops, residue, perennials like alfalfa) "
            "and plant across the slope."
        ),
    }[t.erosion_risk]
    return [
        {
            "text": f"Average slope {t.slope_mean_pct} % (steepest tenth of the field {t.slope_p90_pct} %), "
            f"height about {t.elevation_m:.0f} m. {advice}",
            "source": SOURCE,
        }
    ]


class NasademClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self._settings = settings
        self._transport = transport
        self._dir = Path(settings.cache_dir) / "nasadem"
        self._locks: dict[str, asyncio.Lock] = {}

    async def tile_path(self, tile: str) -> Path | None:
        """Path of the tile's .hgt file, downloading it once. None when NASA has no tile (open sea)."""
        if not self._settings.earthdata_configured:
            raise ApiError(
                503, "EARTHDATA_NOT_CONFIGURED", "NASA Earthdata is not set up on this server yet."
            )
        path = self._dir / f"{tile}.hgt"
        if path.exists():
            return path
        lock = self._locks.setdefault(tile, asyncio.Lock())
        async with lock:
            if path.exists():
                return path
            url = self._settings.nasadem_url.format(tile=tile)
            token = self._settings.earthdata_token.get_secret_value()
            try:
                async with httpx.AsyncClient(
                    timeout=180, follow_redirects=True, transport=self._transport
                ) as client:
                    res = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            except httpx.HTTPError as exc:
                raise ApiError(502, "NASA_UNREACHABLE", "NASA LP DAAC did not answer.") from exc
            if res.status_code == 404:
                return None
            if res.status_code in (401, 403):
                raise ApiError(
                    502, "EARTHDATA_AUTH_FAILED", "NASA Earthdata rejected the server's token (expired?)."
                )
            if res.status_code != 200:
                raise ApiError(502, "NASA_ERROR", f"NASA LP DAAC answered {res.status_code}.")
            data = await asyncio.to_thread(_extract_hgt, res.content)
            self._dir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            os.replace(tmp, path)
            return path


def _extract_hgt(zipped: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(zipped)) as z:
        name = next((n for n in z.namelist() if n.lower().endswith(".hgt")), None)
        if not name:
            raise ApiError(502, "NASA_ERROR", "The NASADEM tile had no height grid.")
        data = z.read(name)
    if len(data) != SAMPLES * SAMPLES * 2:
        raise ApiError(502, "NASA_ERROR", "The NASADEM tile has an unexpected size.")
    return data
