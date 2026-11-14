"""Shared response envelope: every endpoint returns {"data": ..., "metadata": {...}}.

JSON is camelCase (frontend convention); Python stays snake_case via aliases.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DataStatus(StrEnum):
    """Status vocabulary from the API spec. Never claim `available` without real data."""

    available = "available"
    partial = "partial"            # some inputs missing, result still usable
    delayed = "delayed"            # source has latency; latest days missing
    unavailable = "unavailable"    # source failed
    not_configured = "not_configured"  # provider not wired up yet
    demo = "demo"                  # illustrative data, never show as live


class ValueKind(StrEnum):
    """Distinguish measured data from what we computed (acceptance criterion)."""

    observed = "observed"
    calculated = "calculated"
    estimated = "estimated"
    modeled = "modeled"
    demo = "demo"


class Metadata(ApiModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")

    source: str | list[str]
    last_updated: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: DataStatus = DataStatus.available


T = TypeVar("T")


class Envelope(ApiModel, Generic[T]):
    data: T
    metadata: Metadata


def envelope(data: Any, source: str | list[str], status: DataStatus = DataStatus.available,
             **extra: Any) -> dict[str, Any]:
    """Build a success envelope. Extra kwargs become metadata fields (e.g. resolution, notes)."""
    meta = Metadata(source=source, status=status, **extra)
    return {"data": data, "metadata": meta.model_dump(by_alias=True, mode="json")}
