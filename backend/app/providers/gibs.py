"""NASA GIBS: ready-made satellite imagery tiles (WMTS, EPSG:3857) for the CesiumJS globe.

The browser loads tiles straight from GIBS (no key needed); the backend only
publishes layer metadata + tile URL templates. Layer IDs, tile matrix sets and
legend URLs were taken from the live GetCapabilities document:
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.core.config import get_settings
from app.core.http import get_client


@dataclass(frozen=True)
class GibsLayer:
    id: str                 # our id, used by the frontend
    gibs_id: str
    name: str
    unit: str | None
    period: str             # daily | monthly
    tile_matrix_set: str
    fmt: str                # png | jpg
    latency_days: int
    start_date: str
    legend_url: str | None
    source: str
    description: str

    @property
    def max_level(self) -> int:
        return int(self.tile_matrix_set.rsplit("Level", 1)[1])

    def default_time(self, today: date | None = None) -> str:
        today = today or date.today()
        d = today - timedelta(days=self.latency_days)
        if self.period == "monthly":
            # Monthly composites are stamped on the 1st and land ~1-2 months late.
            d = (d.replace(day=1) - timedelta(days=1)).replace(day=1)
        return d.isoformat()

    def tile_url(self, time: str | None = None) -> str:
        """XYZ template usable by Cesium UrlTemplateImageryProvider ({z}/{y}/{x})."""
        base = get_settings().gibs_wmts_base_url
        return (f"{base}/{self.gibs_id}/default/{time or self.default_time()}/"
                f"{self.tile_matrix_set}/{{z}}/{{y}}/{{x}}.{self.fmt}")

    def to_dict(self, time: str | None = None) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": "raster",
            "unit": self.unit,
            "available": True,
            "source": self.source,
            "provider": "NASA GIBS",
            "gibsLayer": self.gibs_id,
            "description": self.description,
            "delivery": {
                "format": "xyz",  # also WMTS-compatible
                "tileUrl": self.tile_url(time),
                "projection": "EPSG:3857",
                "tileMatrixSet": self.tile_matrix_set,
                "maximumLevel": self.max_level,
                "imageFormat": f"image/{'jpeg' if self.fmt == 'jpg' else 'png'}",
            },
            "time": {
                "period": self.period,
                "default": time or self.default_time(),
                "start": self.start_date,
                "latencyDays": self.latency_days,
            },
            "legend": {"url": self.legend_url},
        }


LAYERS: dict[str, GibsLayer] = {
    layer.id: layer
    for layer in [
        GibsLayer(
            id="true-color", gibs_id="MODIS_Terra_CorrectedReflectance_TrueColor",
            name="True color (MODIS Terra)", unit=None, period="daily",
            tile_matrix_set="GoogleMapsCompatible_Level9", fmt="jpg", latency_days=1,
            start_date="2000-02-24", legend_url=None, source="MODIS Terra",
            description="Natural-color daily satellite imagery, 250 m.",
        ),
        GibsLayer(
            id="vegetation", gibs_id="MODIS_Terra_L3_NDVI_Monthly",
            name="Vegetation health (NDVI, monthly)", unit="NDVI", period="monthly",
            tile_matrix_set="GoogleMapsCompatible_Level7", fmt="png", latency_days=30,
            start_date="2000-03-01",
            legend_url="https://gibs.earthdata.nasa.gov/legends/MODIS_L3_NDVI_H.svg",
            source="MODIS Terra MOD13", description="Monthly NDVI composite, ~1 km.",
        ),
        GibsLayer(
            id="precipitation", gibs_id="IMERG_Precipitation_Rate",
            name="Precipitation rate (GPM IMERG)", unit="mm/hr", period="daily",
            tile_matrix_set="GoogleMapsCompatible_Level6", fmt="png", latency_days=3,
            start_date="2000-06-01",
            legend_url="https://gibs.earthdata.nasa.gov/legends/GPM_Precipitation_Rate_H.svg",
            source="NASA GPM IMERG", description="Global precipitation rate, ~10 km.",
        ),
        GibsLayer(
            id="soil-moisture", gibs_id="SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
            name="Root-zone soil moisture (SMAP L4)", unit="m³/m³", period="daily",
            tile_matrix_set="GoogleMapsCompatible_Level6", fmt="png", latency_days=5,
            start_date="2015-03-31",
            legend_url="https://gibs.earthdata.nasa.gov/legends/SMAP_Analyzed_Soil_Moisture_H.svg",
            source="NASA SMAP L4",
            description="Model-assimilated root-zone soil moisture, ~9 km. Regional, "
                        "not a field-level reading.",
        ),
    ]
}


async def check_status() -> dict:
    layer = LAYERS["true-color"]
    url = layer.tile_url().format(z=0, y=0, x=0)
    try:
        resp = await get_client().get(url, timeout=15)
        return {"status": "available" if resp.status_code == 200 else "unavailable",
                "detail": None if resp.status_code == 200 else f"HTTP {resp.status_code}"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "unavailable", "detail": type(exc).__name__}
