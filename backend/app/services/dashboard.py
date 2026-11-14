"""One request for the country dashboard. Each section succeeds or fails on its own."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.errors import ApiError
from app.providers import gibs
from app.services import climate, countries

log = logging.getLogger(__name__)


async def _section(fn: Callable[[], Awaitable[tuple[Any, dict]]]) -> dict:
    try:
        data, meta = await fn()
        return {"status": meta.get("status", "available"), "data": data, "metadata": meta}
    except ApiError as exc:
        return {"status": "unavailable", "data": None,
                "error": {"code": exc.code, "message": exc.message}}
    except Exception as exc:  # noqa: BLE001 - one section must not sink the dashboard
        log.exception("dashboard section failed", exc_info=exc)
        return {"status": "unavailable", "data": None,
                "error": {"code": "INTERNAL_ERROR", "message": "Section failed"}}


async def build(code: str) -> dict:
    country = countries.details(code)  # raises 404 for unknown countries, intentionally

    async def layers():
        return [layer.to_dict() for layer in gibs.LAYERS.values()], {"source": "NASA GIBS"}

    async def not_yet(name: str):
        return None, {"status": "not_configured", "note": f"{name} is planned (priority 2)"}

    indicators, climate_summary, map_layers, insights, risk, impact = await asyncio.gather(
        _section(lambda: climate.indicators(code)),
        _section(lambda: climate.summary(code)),
        _section(layers),
        _section(lambda: not_yet("insights")),
        _section(lambda: not_yet("risk assessment")),
        _section(lambda: not_yet("impact summary")),
    )
    return {
        "country": country,
        "sections": {
            "indicators": indicators,
            "climateSummary": climate_summary,
            "mapLayers": map_layers,
            "insights": insights,
            "riskAssessment": risk,
            "impactSummary": impact,
        },
    }
