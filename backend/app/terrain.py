"""Field slope and erosion risk from NASA NASADEM (SRTM reprocessed, 1 arc-second ≈ 30 m).

NASADEM tiles are 1° × 1° zip files on NASA LP DAAC (Earthdata Login token needed). Each holds a
3601 × 3601 grid of big-endian int16 heights in metres, north row first. A tile is downloaded
once and kept in the cache volume; only the rows under the field are read.

SRTM-based heights carry a few metres of noise per pixel, which on flat land looks like 3–6 %
slope if slope is taken pixel by pixel. So:
  * field slope = tilt of one least-squares plane through every height inside the field
    (noise averages out; a flat polder reads ≈ 0 %);
  * steep parts = Horn's method on 3 × 3-pixel block means (≈ 90 m), which cuts the noise ~3×.
Heights are a surface model, so buildings and tall trees add bumps. Erosion-risk classes are an
indicative rule of thumb (water erosion rises sharply above 2–5 % slope), not a soil-loss model.
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
BLOCK = 3  # pixels per side of the ≈ 90 m blocks used for local slope
MIN_FIT = 11  # the plane is fitted over at least 11 × 11 pixels (≈ 330 m), so height noise can't fake a tilt
MARGIN = max(2 * BLOCK + 1, MIN_FIT // 2 + 1)  # pixels read around the field (block neighbours, small fields)


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
    """Reads the field's box plus a margin for the block neighbours, clipped to the tile."""
    to_row = lambda lat: (lat0 + 1 - lat) * (SAMPLES - 1)  # noqa: E731
    to_col = lambda lon: (lon - lon0) * (SAMPLES - 1)  # noqa: E731
    r0 = max(0, math.floor(to_row(north)) - MARGIN)
    r1 = min(SAMPLES - 1, math.ceil(to_row(south)) + MARGIN)
    c0 = max(0, math.floor(to_col(west)) - MARGIN)
    c1 = min(SAMPLES - 1, math.ceil(to_col(east)) + MARGIN)
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


def plane_slope_pct(points: list[tuple[float, float, float]]) -> float | None:
    """Slope (%) of the least-squares plane z = a·x + b·y + c through (x m, y m, z m) points."""
    n = len(points)
    if n < 3:
        return None
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    mz = sum(p[2] for p in points) / n
    sxx = sum((p[0] - mx) ** 2 for p in points)
    syy = sum((p[1] - my) ** 2 for p in points)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in points)
    sxz = sum((p[0] - mx) * (p[2] - mz) for p in points)
    syz = sum((p[1] - my) * (p[2] - mz) for p in points)
    det = sxx * syy - sxy**2
    if det <= 0:
        return None
    a = (sxz * syy - syz * sxy) / det
    b = (syz * sxx - sxz * sxy) / det
    return 100 * math.hypot(a, b)


def compute_terrain(w: Window, polygon: list[Point]) -> Terrain | None:
    """Field slope (plane fit), steep parts (≈ 90 m blocks) and height for the field."""
    step = 1 / (SAMPLES - 1)
    rows, cols = len(w.rows), len(w.rows[0])
    lat_of = lambda r: w.lat0 + 1 - (w.row0 + r) * step  # noqa: E731
    lon_of = lambda c: w.lon0 + (w.col0 + c) * step  # noqa: E731
    lat_ref = lat_of(rows / 2)
    mx_per_deg = METRES_PER_DEGREE * math.cos(math.radians(lat_ref))

    def xyz(r: int, c: int) -> tuple[float, float, float]:
        return (
            (lon_of(c) - lon_of(0)) * mx_per_deg,
            (lat_of(r) - lat_of(0)) * METRES_PER_DEGREE,
            float(w.rows[r][c]),
        )

    inside = [
        (r, c)
        for r in range(rows)
        for c in range(cols)
        if w.rows[r][c] != VOID and point_in_ring(lon_of(c), lat_of(r), polygon)
    ]
    if not inside:  # field smaller than a pixel: the pixel nearest to its centre
        clon = sum(p[0] for p in polygon) / len(polygon)
        clat = sum(p[1] for p in polygon) / len(polygon)
        rc, cc = round((w.lat0 + 1 - clat) / step) - w.row0, round((clon - w.lon0) / step) - w.col0
        if not (0 <= rc < rows and 0 <= cc < cols) or w.rows[rc][cc] == VOID:
            return None
        inside = [(rc, cc)]
    fit = inside
    if len(inside) < MIN_FIT * MIN_FIT:  # small field: fit the plane over ≈ 330 m around it
        rc = round(sum(r for r, _ in inside) / len(inside))
        cc = round(sum(c for _, c in inside) / len(inside))
        h = MIN_FIT // 2
        around = {(r, c) for r in range(rc - h, rc + h + 1) for c in range(cc - h, cc + h + 1)} | set(inside)
        fit = [(r, c) for r, c in around if 0 <= r < rows and 0 <= c < cols and w.rows[r][c] != VOID]
    field_slope = plane_slope_pct([xyz(r, c) for r, c in fit])
    if field_slope is None:
        return None
    heights = [w.rows[r][c] for r, c in inside]

    # Local slope on ≈ 90 m block means (Horn's method on the block grid).
    nbr, nbc = rows // BLOCK, cols // BLOCK
    blocks: list[list[float | None]] = []
    for bi in range(nbr):
        line: list[float | None] = []
        for bj in range(nbc):
            vals = [w.rows[bi * BLOCK + i][bj * BLOCK + j] for i in range(BLOCK) for j in range(BLOCK)]
            line.append(None if VOID in vals else sum(vals) / len(vals))
        blocks.append(line)
    dy = METRES_PER_DEGREE * step * BLOCK
    dx = mx_per_deg * step * BLOCK
    local: list[float] = []
    for bi in range(1, nbr - 1):
        for bj in range(1, nbc - 1):
            centre_r, centre_c = bi * BLOCK + BLOCK // 2, bj * BLOCK + BLOCK // 2
            if not point_in_ring(lon_of(centre_c), lat_of(centre_r), polygon):
                continue
            z = [[blocks[bi + i][bj + j] for j in (-1, 0, 1)] for i in (-1, 0, 1)]
            if any(v is None for row in z for v in row):
                continue
            dzdx = ((z[0][2] + 2 * z[1][2] + z[2][2]) - (z[0][0] + 2 * z[1][0] + z[2][0])) / (8 * dx)  # type: ignore[operator]
            dzdy = ((z[2][0] + 2 * z[2][1] + z[2][2]) - (z[0][0] + 2 * z[0][1] + z[0][2])) / (8 * dy)  # type: ignore[operator]
            local.append(100 * math.hypot(dzdx, dzdy))
    if not local:  # field smaller than one block: its own plane is all we can say
        local = [field_slope]
    local.sort()
    steep = sum(1 for s in local if s > 5) / len(local)
    return Terrain(
        elevation_m=round(sum(heights) / len(heights)),
        slope_mean_pct=round(field_slope, 1),
        slope_p90_pct=round(max(field_slope, local[min(len(local) - 1, int(0.9 * len(local)))]), 1),
        steep_share=round(steep, 2),
        erosion_risk=erosion_risk(field_slope, steep),
        pixels=len(inside),
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
            "text": f"Field slope {t.slope_mean_pct} % (steepest tenth of the field {t.slope_p90_pct} %), "
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
