import array
import io
import math
import zipfile

import httpx

from app.terrain import SAMPLES, VOID, Window, compute_terrain, erosion_risk, tile_name

STEP = 1 / (SAMPLES - 1)
DY = 111_320.0 * STEP  # metres per pixel north-south
FIELD = [[68.774, 37.838], [68.776, 37.838], [68.776, 37.840], [68.774, 37.840]]  # ≈ 3.5 ha


def plane(
    slope_pct: float,
    rows: int = 400,
    cols: int = 400,
    lat0: int = 37,
    lon0: int = 68,
    row0: int = 0,
    col0: int = 0,
):
    """Heights rising southward at `slope_pct` (rounded to whole metres like real tiles)."""
    return Window(
        lat0,
        lon0,
        row0,
        col0,
        [[round(1000 + r * DY * slope_pct / 100) for _ in range(cols)] for r in range(rows)],
    )


def window_over_field(slope_pct: float) -> Window:
    row0 = round((38 - 37.841) / STEP)
    col0 = round((68.773 - 68) / STEP)
    return plane(slope_pct, rows=12, cols=12, row0=row0, col0=col0)


def test_tile_name():
    assert tile_name(37.84, 68.77) == "n37e068"
    assert tile_name(-0.5, -0.5) == "s01w001"


def test_flat_and_sloped_fields():
    flat = compute_terrain(window_over_field(0), FIELD)
    assert flat and flat.slope_mean_pct == 0 and flat.erosion_risk == "low" and flat.pixels > 20
    gentle = compute_terrain(window_over_field(3), FIELD)
    assert gentle and 2.5 <= gentle.slope_mean_pct <= 3.5 and gentle.erosion_risk == "moderate"
    steep = compute_terrain(window_over_field(8), FIELD)
    assert steep and steep.erosion_risk == "high" and steep.steep_share == 1


def test_voids_are_skipped_and_tiny_fields_use_the_nearest_pixel():
    w = window_over_field(3)
    for row in w.rows:
        row[5] = VOID
    t = compute_terrain(w, FIELD)
    assert t and t.pixels > 0
    tiny = [[68.77500, 37.83900], [68.77501, 37.83900], [68.77501, 37.83901]]
    t2 = compute_terrain(window_over_field(3), tiny)
    assert t2 and t2.pixels == 1


def test_erosion_rule():
    assert erosion_risk(1.0, 0.0) == "low"
    assert erosion_risk(2.0, 0.0) == "moderate"
    assert erosion_risk(1.0, 0.15) == "moderate"
    assert erosion_risk(5.0, 0.0) == "high"
    assert erosion_risk(3.0, 0.3) == "high"


def fake_tile(slope_pct: float) -> bytes:
    """A real-size NASADEM zip: 3601 × 3601 big-endian int16 heights."""
    grid = array.array("h")
    for r in range(SAMPLES):
        grid.extend([round(1000 + r * DY * slope_pct / 100)] * SAMPLES)
    grid.byteswap()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("n37e068.hgt", grid.tobytes())
    return buf.getvalue()


def test_terrain_endpoint_downloads_once_and_caches(make_client):
    tile = fake_tile(3)
    calls = []

    def nasa(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        assert request.headers["Authorization"] == "Bearer edl-token"
        return httpx.Response(200, content=tile)

    client, _ = make_client(earthdata=True, nasadem=nasa)
    for _ in range(2):
        res = client.post("/api/v1/fields/terrain", json={"polygon": FIELD})
        assert res.status_code == 200, res.text
    body = res.json()
    assert body["erosionRisk"] == "moderate" and math.isclose(body["slopeMeanPct"], 3, abs_tol=0.5)
    assert body["evidence"][0]["source"] == "NASA NASADEM (SRTM, 30 m)"
    assert len(calls) == 1 and calls[0].endswith("NASADEM_HGT_n37e068/NASADEM_HGT_n37e068.zip")


def test_terrain_errors(make_client):
    client, _ = make_client(earthdata=False)
    assert (
        client.post("/api/v1/fields/terrain", json={"polygon": FIELD}).json()["error"]["code"]
        == "EARTHDATA_NOT_CONFIGURED"
    )
    client, _ = make_client(earthdata=True, nasadem=lambda r: httpx.Response(401))
    assert (
        client.post("/api/v1/fields/terrain", json={"polygon": FIELD}).json()["error"]["code"]
        == "EARTHDATA_AUTH_FAILED"
    )
    client, _ = make_client(earthdata=True, nasadem=lambda r: httpx.Response(404))
    res = client.post("/api/v1/fields/terrain", json={"polygon": FIELD})
    assert res.status_code == 404 and res.json()["error"]["code"] == "NO_ELEVATION_DATA"
    bad = client.post("/api/v1/fields/terrain", json={"polygon": FIELD[:2]})
    assert bad.status_code == 422
