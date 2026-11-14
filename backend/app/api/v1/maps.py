from fastapi import APIRouter, Query

from app.core.errors import NotFound
from app.core.responses import envelope
from app.providers import gibs
from app.services import countries

router = APIRouter(prefix="/countries/{code}/map", tags=["map"])


@router.get("/layers")
async def map_layers(code: str):
    countries.get_country(code)  # validate code; GIBS layers are global
    return envelope([layer.to_dict() for layer in gibs.LAYERS.values()], source="NASA GIBS",
                    notes="Tiles load directly from GIBS in the browser; no API key needed.")


@router.get("/layers/{layer_id}")
async def map_layer(code: str, layer_id: str,
                    time: str | None = Query(None, description="ISO date for the imagery")):
    countries.get_country(code)
    layer = gibs.LAYERS.get(layer_id)
    if layer is None:
        raise NotFound(f"Unknown layer '{layer_id}'", details={"available": sorted(gibs.LAYERS)})
    return envelope(layer.to_dict(time), source="NASA GIBS")
