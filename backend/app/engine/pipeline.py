"""Transparent, rule-based crop rotation engine (workflow doc, section 6).

Steps: candidates -> hard constraints -> rotation evaluation -> economics -> rank.
Every score is reproducible from the inputs and the documented weights below.
No LLM is involved; an LLM may later *explain* this output, never change it.
"""

from dataclasses import dataclass, field
from datetime import date

from app.engine import catalog

# Documented weights per farmer priority (each row sums to 1).
WEIGHTS: dict[str, dict[str, float]] = {
    "default":      {"climate": 0.35, "water": 0.25, "rotation": 0.30, "economics": 0.10},
    "profit":       {"climate": 0.25, "water": 0.15, "rotation": 0.20, "economics": 0.40},
    "yield":        {"climate": 0.45, "water": 0.25, "rotation": 0.20, "economics": 0.10},
    "water_saving": {"climate": 0.25, "water": 0.50, "rotation": 0.20, "economics": 0.05},
    "soil_health":  {"climate": 0.25, "water": 0.15, "rotation": 0.55, "economics": 0.05},
    "low_risk":     {"climate": 0.40, "water": 0.35, "rotation": 0.20, "economics": 0.05},
}
TEMP_MARGIN_C = 3.0          # within this distance of the optimal range = marginal, not fail
RAINFED_MARGINAL_SHARE = 0.7  # rainfall >= 70% of minimum need = marginal


@dataclass
class Finding:
    kind: str     # pass | warn | fail | info
    check: str
    message: str
    evidence: dict | None = None

    def to_dict(self) -> dict:
        d = {"kind": self.kind, "check": self.check, "message": self.message}
        if self.evidence:
            d["evidence"] = self.evidence
        return d


@dataclass
class CropResult:
    crop: dict
    components: dict[str, float | None] = field(default_factory=dict)
    findings: list[Finding] = field(default_factory=list)
    excluded: bool = False
    economics: dict | None = None
    season: dict | None = None
    score: float | None = None


def _climate(r: CropResult, season: dict | None) -> None:
    lo, hi = r.crop["tempOptimalC"]
    if season is None:
        r.components["climate"] = 0.5
        r.findings.append(Finding("warn", "climate",
                                  "Planting date or climate data missing; season not checked."))
        return
    t = season["meanTempC"]
    ev = {"seasonMeanTempC": t, "optimalRangeC": [lo, hi], "source": "NASA POWER",
          "seasonsAveraged": len(season["seasonsUsed"])}
    if lo <= t <= hi:
        r.components["climate"] = 1.0
        r.findings.append(Finding("pass", "climate", f"Season mean {t} °C is within {lo}-{hi} °C.", ev))
    elif lo - TEMP_MARGIN_C <= t <= hi + TEMP_MARGIN_C:
        r.components["climate"] = 0.5
        r.findings.append(Finding("warn", "climate",
                                  f"Season mean {t} °C is just outside {lo}-{hi} °C.", ev))
    else:
        r.components["climate"] = 0.0
        r.excluded = True
        r.findings.append(Finding("fail", "climate",
                                  f"Season mean {t} °C is far outside {lo}-{hi} °C.", ev))
    if r.crop["frostSensitive"] and season["frostDays"] > 0:
        r.components["climate"] = max(0.0, r.components["climate"] - 0.25)
        r.findings.append(Finding("warn", "frost",
                                  f"About {season['frostDays']} frost day(s) per season historically.",
                                  {"frostDaysPerSeason": season["frostDays"], "source": "NASA POWER"}))


def _water(r: CropResult, season: dict | None, irrigation: str, efficiency: float) -> None:
    need_lo, need_hi = r.crop["waterNeedMm"]
    if irrigation in ("irrigated", "both"):
        fit = 1.0
        r.findings.append(Finding("info", "water",
                                  f"Needs about {need_lo}-{need_hi} mm; relies on irrigation.",
                                  {"waterNeedMm": [need_lo, need_hi]}))
    elif season is None:
        fit = 0.5
        r.findings.append(Finding("warn", "water", "Seasonal rainfall not checked."))
    else:
        rain = season["precipMm"]
        ev = {"seasonRainfallMm": rain, "waterNeedMm": [need_lo, need_hi], "source": "NASA POWER"}
        if rain >= need_lo:
            fit = 1.0
            r.findings.append(Finding("pass", "water", f"Season rainfall ~{rain:.0f} mm meets need.", ev))
        elif rain >= RAINFED_MARGINAL_SHARE * need_lo:
            fit = 0.5
            r.findings.append(Finding("warn", "water",
                                      f"Season rainfall ~{rain:.0f} mm is below the {need_lo} mm minimum.",
                                      ev))
        else:
            fit = 0.0
            hard = irrigation == "rainfed"  # unknown irrigation: warn instead of exclude
            r.excluded = r.excluded or hard
            r.findings.append(Finding("fail" if hard else "warn", "water",
                                      f"Season rainfall ~{rain:.0f} mm is far below the "
                                      f"{need_lo} mm minimum for a rainfed crop.", ev))
    # Half fit, half how thirsty the crop is relative to the rest of the catalog.
    r.components["water"] = round(0.5 * fit + 0.5 * efficiency, 3)


def _rotation(r: CropResult, history: list[dict | None], pests: list[str]) -> None:
    score = 0.6
    last = history[0] if history else None
    if not history or last is None:
        r.findings.append(Finding("warn", "rotation", "Previous crop unknown; rotation not scored."))
        r.components["rotation"] = 0.5
    else:
        c = r.crop
        if last["id"] == c["id"]:
            score -= 0.4
            msg = f"Same crop as last season ({last['name']}): pest and disease carry-over risk."
            if len(history) > 1 and history[1] and history[1]["id"] == c["id"]:
                score -= 0.2
                msg = f"Would be the third {last['name']} season in a row: high carry-over risk."
            r.findings.append(Finding("warn", "rotation", msg))
        elif last["family"] == c["family"]:
            score -= 0.15
            r.findings.append(Finding("warn", "rotation",
                                      f"Same plant family as last season ({c['family']})."))
        else:
            score += 0.15
            r.findings.append(Finding("pass", "rotation",
                                      f"Breaks the {last['family']} cycle from last season."))
        if c["nitrogenFixing"] and last["group"] == "cereal":
            score += 0.2
            r.findings.append(Finding("pass", "rotation",
                                      "Legume after a cereal: can add nitrogen for the next crop."))
        elif last.get("nitrogenFixing") and c["group"] == "cereal":
            score += 0.1
            r.findings.append(Finding("pass", "rotation", "Cereal after a legume: uses residual nitrogen."))
        r.components["rotation"] = round(min(1.0, max(0.0, score)), 3)

    hosts = [h.lower() for h in r.crop.get("pestHosts", [])]
    for pest in pests:
        p = pest.lower()
        if any(p in h or h in p for h in hosts):
            r.components["rotation"] = round(max(0.0, r.components["rotation"] - 0.3), 3)
            r.findings.append(Finding("warn", "pest",
                                      f"{r.crop['name']} is a known host of reported issue '{pest}'."))


def _economics(r: CropResult, econ_inputs: dict) -> None:
    e = econ_inputs.get(r.crop["id"])
    if e is None:
        r.economics = {"status": "omitted",
                       "reason": "No local yield, price and cost provided; profit is not estimated."}
        r.components["economics"] = None
        return
    revenue = e.expected_yield_t_per_ha * e.price_per_tonne
    net = revenue - e.cost_per_ha
    r.economics = {"status": "calculated", "currency": e.currency,
                   "revenuePerHa": round(revenue, 2), "costPerHa": e.cost_per_ha,
                   "netReturnPerHa": round(net, 2),
                   "formula": "expected yield x local price - total costs",
                   "inputsFrom": "farmer"}


def _normalise_economics(results: list[CropResult]) -> None:
    nets = [r.economics["netReturnPerHa"] for r in results
            if r.economics and r.economics["status"] == "calculated"]
    if not nets:
        return
    lo, hi = min(nets), max(nets)
    for r in results:
        if r.economics and r.economics["status"] == "calculated":
            n = r.economics["netReturnPerHa"]
            r.components["economics"] = 1.0 if hi == lo else round((n - lo) / (hi - lo), 3)


def _score(r: CropResult, weights: dict[str, float]) -> float:
    used = {k: w for k, w in weights.items() if r.components.get(k) is not None}
    total = sum(used.values())
    return round(100 * sum(r.components[k] * w for k, w in used.items()) / total, 1)


def run(q, season_for, today: date | None = None) -> dict:
    """Run the engine.

    q:          Questionnaire
    season_for: callable(crop) -> season climate dict or None (injected so the engine
                stays pure and testable without network access)
    """
    missing: list[str] = []
    history = [catalog.resolve_name(c) if c not in ("unknown", "") else None
               for c in q.previous_crops]
    unknown_history = [name for name, c in zip(q.previous_crops, history, strict=True)
                       if c is None and name not in ("unknown", "")]
    if not q.previous_crops or history[0] is None:
        missing.append("previousCrops")
    if q.planting_date is None:
        missing.append("plantingDate")
    if q.irrigation == "unknown":
        missing.append("irrigation")
    if q.priority is None:
        missing.append("priority")
    if not q.economics:
        missing.append("economics (local yield, price, cost)")

    all_crops = catalog.crops()
    needs = [c["waterNeedMm"][0] for c in all_crops]
    lo_need, hi_need = min(needs), max(needs)

    results: list[CropResult] = []
    for crop in all_crops:
        r = CropResult(crop=crop)
        r.season = season_for(crop)
        efficiency = 1 - (crop["waterNeedMm"][0] - lo_need) / ((hi_need - lo_need) or 1)
        _climate(r, r.season)
        _water(r, r.season, q.irrigation, efficiency)
        _rotation(r, history, q.pest_or_disease_issues)
        _economics(r, q.economics)
        results.append(r)

    _normalise_economics(results)
    priority = q.priority or "default"
    weights = WEIGHTS[priority]
    for r in results:
        r.score = _score(r, weights)

    ranked = sorted([r for r in results if not r.excluded], key=lambda r: r.score, reverse=True)
    excluded = [r for r in results if r.excluded]

    confidence = 1.0
    confidence -= 0.15 if "previousCrops" in missing else 0
    confidence -= 0.15 if "plantingDate" in missing else 0
    confidence -= 0.10 if "irrigation" in missing else 0
    confidence -= 0.15  # NDVI, soil, terrain and GAEZ suitability not yet integrated
    catalog_reviewed = catalog.load().get("reviewStatus") == "reviewed"
    if not catalog_reviewed:
        confidence -= 0.10
    confidence = round(max(0.0, confidence), 2)
    level = "high" if confidence >= 0.75 else "medium" if confidence >= 0.5 else "low"
    if level == "high" and not catalog_reviewed:
        level = "medium"  # never claim high confidence on unreviewed agronomic values

    def card(r: CropResult, rank: int | None) -> dict:
        return {
            "rank": rank,
            "cropId": r.crop["id"],
            "name": r.crop["name"],
            "family": r.crop["family"],
            "score": r.score,
            "components": r.components,
            "season": r.season,
            "waterRequirementMm": r.crop["waterNeedMm"],
            "economics": r.economics,
            "reasons": [f.to_dict() for f in r.findings],
        }

    return {
        "recommendations": [card(r, i + 1) for i, r in enumerate(ranked)],
        "excluded": [card(r, None) for r in excluded],
        "method": {
            "priority": priority,
            "weights": weights,
            "steps": ["candidates from catalog", "hard constraints (climate, rainfed water)",
                      "rotation and pest rules", "economics only with farmer inputs",
                      "weighted ranking"],
            "catalogVersion": catalog.load()["version"],
            "catalogReviewStatus": catalog.load().get("reviewStatus"),
        },
        "confidence": {"score": confidence, "level": level},
        "missingInputs": missing,
        "unrecognisedCrops": unknown_history,
        "disclaimer": "Decision support only. Scores come from documented rules and public "
                      "datasets, not field trials; they do not guarantee crop performance.",
    }
