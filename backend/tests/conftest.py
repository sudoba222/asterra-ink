import os
import tempfile
from datetime import date, timedelta

# Isolated cache + test env before the app is imported.
os.environ["ASTERRA_CACHE_DIR"] = tempfile.mkdtemp(prefix="asterra-test-cache-")
os.environ["ASTERRA_ENVIRONMENT"] = "test"

import httpx  # noqa: E402
import pytest  # noqa: E402
import respx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import cache  # noqa: E402
from app.main import app  # noqa: E402


def fake_power_value(param: str, d: date) -> float:
    """Deterministic, seasonal-looking fake values (northern-hemisphere shape)."""
    import math
    season = math.sin((d.timetuple().tm_yday - 100) / 365 * 2 * math.pi)  # peak ~July
    return {
        "T2M": round(12 + 14 * season, 2),
        "T2M_MAX": round(18 + 14 * season, 2),
        "T2M_MIN": round(5 + 14 * season, 2),
        "PRECTOTCORR": 1.5,
        "GWETROOT": 0.5,
        "GWETTOP": 0.45,
        "RH2M": 50.0,
        "ALLSKY_SFC_SW_DWN": 15.0,
    }[param]


def power_handler(request: httpx.Request) -> httpx.Response:
    q = request.url.params
    start = date(int(q["start"][:4]), int(q["start"][4:6]), int(q["start"][6:]))
    end = date(int(q["end"][:4]), int(q["end"][4:6]), int(q["end"][6:]))
    params = q["parameters"].split(",")
    latest_real = date.today() - timedelta(days=3)  # mimic POWER latency
    parameter = {}
    for p in params:
        series, d = {}, start
        while d <= end:
            series[d.strftime("%Y%m%d")] = fake_power_value(p, d) if d <= latest_real else -999.0
            d += timedelta(days=1)
        parameter[p] = series
    return httpx.Response(200, json={"properties": {"parameter": parameter}})


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.get_cache().clear()
    yield


@pytest.fixture
def mock_power():
    with respx.mock(assert_all_called=False) as router:
        router.get(url__startswith="https://power.larc.nasa.gov/api/").mock(side_effect=power_handler)
        router.get(url__startswith="https://gibs.earthdata.nasa.gov/").mock(
            return_value=httpx.Response(200, content=b"img"))
        yield router


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
