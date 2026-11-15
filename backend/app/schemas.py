from datetime import date, timedelta

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.geometry import distinct_points, self_intersects

Coordinate = tuple[float, float]


class NdviRequest(BaseModel):
    """Same polygon format as the frontend's /api/land-suitability: [[lon, lat], ...]."""

    model_config = ConfigDict(populate_by_name=True)

    polygon: list[Coordinate] = Field(min_length=3, max_length=500)
    start: date | None = Field(default=None, alias="from", description="First day. Default: 12 months ago.")
    end: date | None = Field(default=None, alias="to", description="Last day. Default: today.")
    interval_days: int = Field(default=10, ge=5, le=31, alias="intervalDays")

    @model_validator(mode="after")
    def check(self) -> "NdviRequest":
        for lon, lat in self.polygon:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Each corner must be [lon, lat] with lon -180..180 and lat -90..90.")
        if distinct_points(self.polygon) < 3:
            raise ValueError("The field needs at least 3 different corners.")
        if self_intersects(self.polygon):
            raise ValueError("The field outline crosses itself. Draw it again without crossing lines.")

        today = date.today()
        self.end = min(self.end or today, today)
        self.start = self.start or self.end - timedelta(days=365)
        if self.start < date(2017, 3, 28):
            raise ValueError("Sentinel-2 L2A data starts on 2017-03-28.")
        if self.start >= self.end:
            raise ValueError("'from' must be before 'to'.")
        return self


class NdviPoint(BaseModel):
    start: date = Field(serialization_alias="from")
    end: date = Field(serialization_alias="to")
    ndvi_mean: float | None = Field(serialization_alias="ndviMean")
    ndvi_min: float | None = Field(serialization_alias="ndviMin")
    ndvi_max: float | None = Field(serialization_alias="ndviMax")
    ndvi_std: float | None = Field(serialization_alias="ndviStd")
    clear_share: float = Field(
        serialization_alias="clearShare", description="Share of field pixels without cloud."
    )


class NdviResponse(BaseModel):
    source: str
    area_hectares: float = Field(serialization_alias="areaHectares")
    interval_days: int = Field(serialization_alias="intervalDays")
    series: list[NdviPoint]
