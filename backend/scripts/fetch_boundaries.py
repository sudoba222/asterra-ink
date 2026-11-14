"""Download Natural Earth 1:50m country boundaries (public domain) and save one
GeoJSON file per ASTERRA country into app/data/boundaries/.

Run once:  uv run python scripts/fetch_boundaries.py
"""

import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
          "geojson/ne_50m_admin_0_countries.geojson")


def main() -> int:
    codes = {c["code"] for c in json.loads((ROOT / "app/data/countries.json").read_text())["countries"]}
    print(f"Downloading {SOURCE} ...")
    resp = httpx.get(SOURCE, timeout=120, follow_redirects=True)
    resp.raise_for_status()
    features = resp.json()["features"]

    out_dir = ROOT / "app/data/boundaries"
    out_dir.mkdir(parents=True, exist_ok=True)
    found = set()
    for f in features:
        props = f["properties"]
        # ISO_A2_EH fixes Natural Earth's -99 codes (e.g. France, Norway).
        code = props.get("ISO_A2_EH") or props.get("ISO_A2")
        if code in codes:
            fc = {"type": "FeatureCollection", "features": [{
                "type": "Feature",
                "properties": {"code": code, "name": props.get("NAME")},
                "geometry": f["geometry"],
            }]}
            (out_dir / f"{code}.geojson").write_text(json.dumps(fc))
            found.add(code)
    print(f"Saved {len(found)} boundaries: {sorted(found)}")
    if missing := codes - found:
        print(f"Missing: {sorted(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
