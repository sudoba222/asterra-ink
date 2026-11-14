import json
from functools import lru_cache
from pathlib import Path

from app.core.errors import NotFound

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
BOUNDARIES_DIR = DATA_DIR / "boundaries"


def flag_emoji(code: str) -> str:
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


@lru_cache
def _countries() -> dict[str, dict]:
    raw = json.loads((DATA_DIR / "countries.json").read_text())
    return {c["code"]: c for c in raw["countries"]}


def list_countries() -> list[dict]:
    return [summary(c) for c in sorted(_countries().values(), key=lambda c: c["name"])]


def get_country(code: str) -> dict:
    country = _countries().get(code.upper())
    if country is None:
        raise NotFound(f"Country '{code}' is not available in ASTERRA",
                       details={"available": sorted(_countries())})
    return country


def summary(c: dict) -> dict:
    return {
        "code": c["code"],
        "name": c["name"],
        "flag": flag_emoji(c["code"]),
        "center": c["center"],
        "available": True,
        "hasBoundary": (BOUNDARIES_DIR / f"{c['code']}.geojson").exists(),
    }


def details(code: str) -> dict:
    c = get_country(code)
    return {**summary(c), "regions": regions(code)}


def regions(code: str) -> list[dict]:
    c = get_country(code)
    return [
        {**p, "type": "agricultural_sample_point",
         "note": "Proxy point in a major farming region; climate values are sampled here."}
        for p in c["agriPoints"]
    ]


def sample_points(code: str, region_id: str | None = None) -> list[dict]:
    points = get_country(code)["agriPoints"]
    if region_id is None:
        return points
    match = [p for p in points if p["id"] == region_id]
    if not match:
        raise NotFound(f"Region '{region_id}' not found in {code}",
                       details={"available": [p["id"] for p in points]})
    return match


def boundary(code: str) -> dict:
    get_country(code)
    path = BOUNDARIES_DIR / f"{code.upper()}.geojson"
    if not path.exists():
        raise NotFound(
            f"Boundary for {code.upper()} has not been downloaded yet",
            details={"fix": "Run: uv run python scripts/fetch_boundaries.py"},
            code="BOUNDARY_NOT_AVAILABLE",
        )
    return json.loads(path.read_text())
