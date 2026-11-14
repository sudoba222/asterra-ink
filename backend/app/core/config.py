from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from env vars prefixed ASTERRA_ (or a .env file)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ASTERRA_", extra="ignore")

    app_name: str = "ASTERRA API"
    api_version: str = "v1"
    environment: Literal["dev", "prod", "test"] = "dev"
    cors_origins: list[str] = ["http://localhost:3000"]

    cache_dir: Path = Path(".cache")
    cache_ttl_seconds: int = 60 * 60 * 24
    http_timeout_seconds: float = 60.0

    nasa_power_base_url: str = "https://power.larc.nasa.gov/api"
    gibs_wmts_base_url: str = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"

    # Optional providers: when empty, the source reports status "not_configured".
    earthdata_token: SecretStr | None = None
    gee_project: str | None = None
    gee_service_account: str | None = None
    gee_key_file: Path | None = None
    anthropic_api_key: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
