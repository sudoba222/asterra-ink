FIELD = {
    "type": "Polygon",
    "coordinates": [[[68.770, 37.830], [68.780, 37.830], [68.780, 37.838],
                     [68.770, 37.838], [68.770, 37.830]]],
}


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["data"]["status"] == "ok"
    assert {"source", "lastUpdated", "status"} <= body["metadata"].keys()


def test_countries_list_and_details(client):
    r = client.get("/api/v1/countries")
    items = r.json()["data"]
    tj = next(c for c in items if c["code"] == "TJ")
    assert tj["flag"] == "🇹🇯"
    assert tj["center"] == {"latitude": 38.861, "longitude": 71.276}

    r = client.get("/api/v1/countries/tj")  # case-insensitive
    assert r.status_code == 200
    assert len(r.json()["data"]["regions"]) == 3


def test_unknown_country_uses_error_envelope(client):
    r = client.get("/api/v1/countries/ZZ")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_map_layers_have_tile_urls(client):
    r = client.get("/api/v1/countries/TJ/map/layers")
    layers = {layer["id"]: layer for layer in r.json()["data"]}
    assert {"true-color", "vegetation", "precipitation", "soil-moisture"} <= layers.keys()
    url = layers["vegetation"]["delivery"]["tileUrl"]
    assert url.startswith("https://gibs.earthdata.nasa.gov/") and "{z}/{y}/{x}" in url


def test_climate_series_monthly(client, mock_power):
    r = client.get("/api/v1/countries/TJ/climate/precipitation",
                   params={"from": "2025-01-01", "to": "2025-03-31", "interval": "monthly"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["unit"] == "mm"  # daily mm/day summed per month
    jan = data["points"][0]
    assert jan["date"] == "2025-01" and jan["complete"] and jan["value"] == 46.5  # 31 * 1.5


def test_climate_unknown_variable(client, mock_power):
    r = client.get("/api/v1/countries/TJ/climate/ozone")
    assert r.status_code == 400
    assert "supported" in r.json()["error"]["details"]


def test_indicators_and_not_configured(client, mock_power):
    r = client.get("/api/v1/countries/TJ/indicators")
    data = r.json()["data"]
    assert data["temperature"]["status"] == "available"
    assert data["temperature"]["comparison"] == "same month, previous year"
    assert data["vegetation"]["status"] == "not_configured"


def test_dashboard_partial(client, mock_power):
    r = client.get("/api/v1/countries/TJ/dashboard")
    assert r.status_code == 200
    sections = r.json()["data"]["sections"]
    assert sections["indicators"]["data"] is not None
    assert sections["insights"]["status"] == "not_configured"
    assert r.json()["metadata"]["status"] == "partial"


def test_dashboard_survives_power_outage(client):
    import httpx
    import respx
    with respx.mock(assert_all_called=False) as router:
        router.get(url__startswith="https://power.larc.nasa.gov/").mock(
            return_value=httpx.Response(503))
        r = client.get("/api/v1/countries/TJ/dashboard")
    assert r.status_code == 200
    assert r.json()["data"]["sections"]["indicators"]["status"] == "unavailable"
    assert r.json()["data"]["sections"]["mapLayers"]["status"] == "available"


def test_field_profile(client, mock_power):
    r = client.post("/api/v1/fields/profile", json={"geometry": FIELD})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert 60 < data["field"]["areaHa"] < 90
    assert data["layers"]["climate"]["status"] == "available"
    assert data["layers"]["ndvi"]["status"] == "not_configured"


def test_field_profile_rejects_bad_polygon(client):
    bow_tie = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}
    r = client.post("/api/v1/fields/profile", json={"geometry": bow_tie})
    assert r.status_code == 400


def test_recommendations_end_to_end(client, mock_power):
    body = {
        "field": {"geometry": FIELD},
        "questionnaire": {
            "previousCrops": ["corn", "corn"],
            "irrigation": "rainfed",
            "plantingDate": "2027-04-15",
            "priority": "soil_health",
            "pestOrDiseaseIssues": ["rootworm"],
        },
    }
    r = client.post("/api/v1/recommendations/analyze", json=body)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    all_cards = data["recommendations"] + data["excluded"]
    maize = next(c for c in all_cards if c["cropId"] == "maize")
    assert any("third" in x["message"] for x in maize["reasons"])
    assert all(c["economics"]["status"] == "omitted" for c in all_cards)
    assert "economics (local yield, price, cost)" in data["missingInputs"]


def test_country_analyze_adapter(client, mock_power):
    r = client.post("/api/v1/countries/TJ/crop-recommendations/analyze", json={
        "regionId": "tj-khatlon", "currentCrop": "wheat", "soilType": "loamy",
        "season": "spring", "priorities": ["water-efficiency", "soil-health"],
    })
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["method"]["priority"] == "water_saving"
    assert data["location"]["id"] == "tj-khatlon"
