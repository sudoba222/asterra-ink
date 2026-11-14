"""Engine tests run fully offline: season climate is injected."""

from datetime import date

from app.engine import pipeline
from app.schemas.fields import CropEconomicsInput, Questionnaire
from app.services.timeseries import aggregate


def warm_wet(_crop):
    return {"meanTempC": 22.0, "precipMm": 900, "frostDays": 0, "seasonsUsed": ["a", "b"]}


def cold_dry(_crop):
    return {"meanTempC": 4.0, "precipMm": 50, "frostDays": 20, "seasonsUsed": ["a"]}


def by_id(result):
    return {c["cropId"]: c for c in result["recommendations"] + result["excluded"]}


def test_legume_after_cereal_ranks_above_repeat_cereal():
    q = Questionnaire(previous_crops=["maize"], irrigation="rainfed",
                      planting_date=date(2027, 5, 1), priority="soil_health")
    res = by_id(pipeline.run(q, warm_wet))
    assert res["soybean"]["score"] > res["maize"]["score"]


def test_rainfed_cold_dry_excludes_with_reasons():
    q = Questionnaire(previous_crops=["wheat"], irrigation="rainfed",
                      planting_date=date(2027, 5, 1))
    out = pipeline.run(q, cold_dry)
    excluded = {c["cropId"] for c in out["excluded"]}
    assert "cotton" in excluded
    cotton = by_id(out)["cotton"]
    assert any(r["kind"] == "fail" for r in cotton["reasons"])


def test_unknown_irrigation_never_hard_excludes_on_water():
    q = Questionnaire(previous_crops=["wheat"], irrigation="unknown",
                      planting_date=date(2027, 5, 1))
    season = lambda _c: {"meanTempC": 22.0, "precipMm": 10, "frostDays": 0, "seasonsUsed": ["a"]}  # noqa: E731
    out = pipeline.run(q, season)
    assert out["excluded"] == []


def test_missing_inputs_lower_confidence_and_are_listed():
    out = pipeline.run(Questionnaire(), lambda _c: None)
    assert {"previousCrops", "plantingDate", "irrigation"} <= set(out["missingInputs"])
    assert out["confidence"]["level"] == "low"


def test_economics_only_with_farmer_inputs():
    q = Questionnaire(previous_crops=["maize"], planting_date=date(2027, 5, 1), priority="profit",
                      economics={"soybean": CropEconomicsInput(
                          expected_yield_t_per_ha=3, price_per_tonne=400, cost_per_ha=500)})
    res = by_id(pipeline.run(q, warm_wet))
    assert res["soybean"]["economics"]["netReturnPerHa"] == 700
    assert res["wheat"]["economics"]["status"] == "omitted"
    assert res["wheat"]["components"]["economics"] is None


def test_aggregate_flags_incomplete_periods():
    daily = {"2025-02-01": 1.0, "2025-02-02": None, "2025-02-03": 3.0}
    [feb] = aggregate(daily, "monthly", "sum")
    assert feb == {"date": "2025-02", "value": 4.0, "validDays": 2, "expectedDays": 28,
                   "complete": False}
