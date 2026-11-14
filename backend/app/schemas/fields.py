"""Request models for the field-level flow (workflow doc: farmer input + questionnaire)."""

from datetime import date
from typing import Literal

from pydantic import Field, field_validator

from app.core.responses import ApiModel

Irrigation = Literal["rainfed", "irrigated", "both", "unknown"]
Priority = Literal["profit", "yield", "water_saving", "soil_health", "low_risk"]


class GeoJSONPolygon(ApiModel):
    type: Literal["Polygon"]
    coordinates: list[list[tuple[float, float]]] = Field(
        description="GeoJSON order: [longitude, latitude]. First ring is the outer boundary."
    )


class FieldInput(ApiModel):
    name: str | None = None
    geometry: GeoJSONPolygon


class CropEconomicsInput(ApiModel):
    """Farmer-supplied local numbers. Without all three, profit is never ranked."""

    expected_yield_t_per_ha: float = Field(gt=0)
    price_per_tonne: float = Field(gt=0)
    cost_per_ha: float = Field(ge=0)
    currency: str = "USD"


class Questionnaire(ApiModel):
    previous_crops: list[str] = Field(
        default_factory=list, max_length=4,
        description="Most recent season first, e.g. ['maize', 'maize']. Use 'unknown' freely.",
    )
    irrigation: Irrigation = "unknown"
    planting_date: date | None = Field(None, description="Planned planting date (year ignored)")
    priority: Priority | None = None
    pest_or_disease_issues: list[str] = Field(default_factory=list)
    budget: Literal["low", "medium", "high", "unknown"] = "unknown"
    soil_type: str | None = None
    economics: dict[str, CropEconomicsInput] = Field(
        default_factory=dict, description="Optional, keyed by crop id"
    )

    @field_validator("previous_crops", mode="before")
    @classmethod
    def _normalise(cls, v):
        return [str(c).strip().lower() for c in (v or [])]


class AnalyzeRequest(ApiModel):
    field: FieldInput
    questionnaire: Questionnaire = Field(default_factory=Questionnaire)


class CountryAnalyzeRequest(ApiModel):
    """Shape from the ASTERRA API spec (section 8). Mapped onto the questionnaire."""

    region_id: str | None = None
    current_crop: str | None = None
    soil_type: str | None = None
    season: Literal["spring", "summer", "autumn", "fall", "winter"] | None = None
    priorities: list[str] = Field(default_factory=list)
    irrigation: Irrigation = "unknown"
