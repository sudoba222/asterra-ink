from fastapi import APIRouter

from app.api.v1 import climate, countries, maps, recommendations, system

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(countries.router)
api_router.include_router(climate.router)
api_router.include_router(maps.router)
api_router.include_router(recommendations.router)
