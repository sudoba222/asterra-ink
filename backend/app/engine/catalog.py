import json
from functools import lru_cache
from pathlib import Path

from app.core.errors import NotFound

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "crops.json"


@lru_cache
def load() -> dict:
    return json.loads(CATALOG_PATH.read_text())


def crops() -> list[dict]:
    return load()["crops"]


def get(crop_id: str) -> dict:
    for c in crops():
        if c["id"] == crop_id:
            return c
    raise NotFound(f"Unknown crop '{crop_id}'", details={"available": [c["id"] for c in crops()]})


def resolve_name(name: str) -> dict | None:
    """Map free text ('corn', 'Soybeans') to a catalog crop; None if unknown."""
    n = name.strip().lower()
    for c in crops():
        if n == c["id"] or n == c["name"].lower() or n in c.get("aliases", []):
            return c
    return None
