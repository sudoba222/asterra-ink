import io
from datetime import date

import h5py
import httpx
import numpy as np

from app.grace import water_trend

FILE = "https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/X/GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc"


def monthly(cm_per_year: float, years=range(2003, 2025)) -> list[tuple[date, float]]:
    return [
        (date(y, m, 15), cm_per_year * (y + (m - 0.5) / 12 - 2003) + (2 if m in (4, 5) else 0))
        for y in years
        for m in range(1, 13)
    ]


def test_trend_rule():
    falling = water_trend(monthly(-1.5))
    assert falling and falling.status == "falling" and abs(falling.trend_cm_per_year + 1.5) < 0.05
    assert falling.early_cm > falling.late_cm
    assert water_trend(monthly(0.2)).status == "stable"
    assert water_trend(monthly(0.8)).status == "rising"
    assert water_trend(monthly(-1, years=range(2020, 2021))) is None  # under 2 years


def grace_file(cm_per_year: float) -> bytes:
    """Layout of JPL's mascon file: lwe_thickness[time, lat, lon], lon 0.25..359.75, days since 2002."""
    buf = io.BytesIO()
    lats = np.arange(-89.75, 90, 0.5)
    lons = np.arange(0.25, 360, 0.5)
    days = np.array(
        [(date(y, m, 15) - date(2002, 1, 1)).days for y in range(2003, 2025) for m in range(1, 13)],
        dtype=float,
    )
    with h5py.File(buf, "w") as f:
        f["lat"], f["lon"] = lats, lons
        f["time"] = days
        f["time"].attrs["units"] = b"days since 2002-01-01T00:00:00Z"
        data = np.zeros((len(days), len(lats), len(lons)), dtype="f4")
        i, j = int(np.abs(lats - 37.84).argmin()), int(np.abs(lons - 68.77).argmin())
        data[:, i, j] = cm_per_year * (days / 365.25 - 1)
        data[5, i, j] = -99999.0  # a fill value
        f.create_dataset("lwe_thickness", data=data, compression="gzip")
        f["lwe_thickness"].attrs["_FillValue"] = np.float32(-99999.0)
    return buf.getvalue()


def nasa(cm_per_year: float, calls: list[str]):
    content = grace_file(cm_per_year)

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host)
        if request.url.host == "cmr.earthdata.nasa.gov":
            return httpx.Response(
                200, json={"items": [{"umm": {"RelatedUrls": [{"Type": "GET DATA", "URL": FILE}]}}]}
            )
        assert request.headers["Authorization"] == "Bearer edl-token"
        return httpx.Response(200, content=content)

    return handler


def test_water_trend_endpoint(make_client):
    calls: list[str] = []
    client, _ = make_client(earthdata=True, grace=nasa(-1.2, calls))
    res = client.get("/api/v1/water/trend", params={"lat": 37.84, "lon": 68.77})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "falling" and abs(body["trendCmPerYear"] + 1.2) < 0.05
    assert body["months"] == 22 * 12 - 1  # one fill value skipped
    assert "groundwater" in body["evidence"][0]["text"]
    client.get("/api/v1/water/trend", params={"lat": 37.9, "lon": 68.8})  # same 0.5° cell → cached
    assert calls.count("archive.podaac.earthdata.nasa.gov") == 1


def test_water_trend_errors(make_client):
    client, _ = make_client(earthdata=False)
    res = client.get("/api/v1/water/trend", params={"lat": 37.84, "lon": 68.77})
    assert res.json()["error"]["code"] == "EARTHDATA_NOT_CONFIGURED"

    def denied(request: httpx.Request) -> httpx.Response:
        if request.url.host == "cmr.earthdata.nasa.gov":
            return httpx.Response(
                200, json={"items": [{"umm": {"RelatedUrls": [{"Type": "GET DATA", "URL": FILE}]}}]}
            )
        return httpx.Response(401)

    client, _ = make_client(earthdata=True, grace=denied)
    res = client.get("/api/v1/water/trend", params={"lat": 37.84, "lon": 68.77})
    assert res.json()["error"]["code"] == "EARTHDATA_AUTH_FAILED"
    assert client.get("/api/v1/water/trend", params={"lat": 95, "lon": 0}).status_code == 422
