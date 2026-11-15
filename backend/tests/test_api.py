from datetime import date, timedelta

from tests.conftest import FIELD


def ndvi(client, **body):
    return client.post(
        "/api/v1/fields/ndvi", json={"polygon": FIELD, "from": "2025-06-01", "to": "2025-06-25", **body}
    )


def test_health_says_whether_copernicus_is_set_up(make_client):
    client, _ = make_client(configured=False)
    assert client.get("/api/v1/health").json() == {
        "status": "ok",
        "environment": "dev",
        "copernicus": "missing",
        "earthdata": "missing",
    }
    client, _ = make_client()
    assert client.get("/api/v1/health").json()["copernicus"] == "configured"


def test_ndvi_series(make_client):
    client, fake = make_client()
    res = ndvi(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["intervalDays"] == 10
    assert 90 < body["areaHectares"] < 100
    clear, cloudy, failed = body["series"]
    assert clear == {
        "from": "2025-06-01",
        "to": "2025-06-10",
        "ndviMean": 0.6123,
        "ndviMin": 0.1,
        "ndviMax": 0.82,
        "ndviStd": 0.09,
        "clearShare": 0.8,
    }
    assert cloudy["ndviMean"] is None and cloudy["clearShare"] == 0
    assert failed["ndviMean"] is None and failed["to"] == "2025-06-25"


def test_request_sent_to_copernicus(make_client):
    client, fake = make_client()
    ndvi(client, intervalDays=5)
    ((_, sent),) = [c for c in fake.calls if c[0] == "stats"]
    ring = sent["input"]["bounds"]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1] and len(ring) == 5  # closed ring
    assert sent["input"]["data"][0]["type"] == "sentinel-2-l2a"
    agg = sent["aggregation"]
    assert agg["timeRange"] == {"from": "2025-06-01T00:00:00Z", "to": "2025-06-26T00:00:00Z"}
    assert agg["aggregationInterval"]["of"] == "P5D"
    assert "SCL" in agg["evalscript"]


def test_same_field_is_cached_and_token_reused(make_client):
    client, fake = make_client()
    assert ndvi(client).status_code == 200
    assert ndvi(client).status_code == 200
    assert fake.count("stats") == 1
    assert ndvi(client, intervalDays=7).status_code == 200
    assert fake.count("stats") == 2
    assert fake.count("token") == 1


def test_defaults_to_last_12_months(make_client):
    client, fake = make_client()
    assert client.post("/api/v1/fields/ndvi", json={"polygon": FIELD}).status_code == 200
    ((_, sent),) = [c for c in fake.calls if c[0] == "stats"]
    tr = sent["aggregation"]["timeRange"]
    assert tr["to"] == f"{date.today() + timedelta(days=1)}T00:00:00Z"
    assert tr["from"] == f"{date.today() - timedelta(days=365)}T00:00:00Z"


def test_bad_polygons_get_422_not_500(make_client):
    client, fake = make_client()
    cases = [
        [[68.78, 38.56], [68.79, 38.56]],  # 2 corners
        [[68.78, 38.56], [68.78, 38.56], [68.78, 38.56]],  # same point 3 times
        [[68.78, 38.56], [68.79, 38.57], [68.79, 38.56], [68.78, 38.57]],  # bow-tie
        [[200, 38.56], [68.79, 38.56], [68.79, 38.57]],  # lon out of range
    ]
    for polygon in cases:
        res = client.post("/api/v1/fields/ndvi", json={"polygon": polygon})
        assert res.status_code == 422, polygon
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert fake.calls == []


def test_limits_protect_the_quota(make_client):
    client, fake = make_client()
    huge = [[60, 38], [61, 38], [61, 39], [60, 39]]
    res = client.post("/api/v1/fields/ndvi", json={"polygon": huge})
    assert res.status_code == 422 and res.json()["error"]["code"] == "FIELD_TOO_LARGE"
    res = ndvi(client, **{"from": "2018-01-01", "to": "2025-01-01"})
    assert res.status_code == 422 and res.json()["error"]["code"] == "RANGE_TOO_LONG"
    res = ndvi(client, **{"from": "2016-01-01", "to": "2016-06-01"})
    assert res.status_code == 422
    res = ndvi(client, **{"from": "2025-06-10", "to": "2025-06-01"})
    assert res.status_code == 422
    assert fake.calls == []


def test_not_configured(make_client):
    client, _ = make_client(configured=False)
    res = ndvi(client)
    assert res.status_code == 503 and res.json()["error"]["code"] == "COPERNICUS_NOT_CONFIGURED"


def test_copernicus_failures_are_clear(make_client):
    client, _ = make_client(token_status=401)
    assert ndvi(client).json()["error"]["code"] == "COPERNICUS_AUTH_FAILED"

    client, _ = make_client(stats_status=429)
    res = ndvi(client)
    assert res.status_code == 503 and res.headers["Retry-After"] == "120"
    assert res.json()["error"]["code"] == "COPERNICUS_BUSY"

    client, _ = make_client(stats_status=500)
    res = ndvi(client)
    assert res.status_code == 502 and res.json()["error"]["code"] == "COPERNICUS_ERROR"


def test_secret_never_leaks(make_client):
    client, _ = make_client()
    for path in ("/api/v1/health", "/api/v1/openapi.json"):
        assert "secret" not in client.get(path).text.lower().replace("client_secret", "")
