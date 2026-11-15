"""Settings, read from environment variables or backend/.env. Every name starts with ASTERRA_."""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ASTERRA_", env_file=".env", extra="ignore")

    environment: str = "dev"
    cors_origins: list[str] = ["http://localhost:3000"]

    cache_dir: str = ".cache"
    cache_ttl_seconds: int = 86_400
    http_timeout_seconds: float = 60

    # Copernicus Data Space Ecosystem OAuth client (Sentinel Hub dashboard → User settings → OAuth clients).
    copernicus_client_id: str = ""
    copernicus_client_secret: SecretStr = SecretStr("")
    copernicus_token_url: str = (
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    )
    copernicus_statistics_url: str = "https://sh.dataspace.copernicus.eu/statistics/v1"

    # Limits that protect the free Copernicus quota.
    max_field_hectares: float = 5_000
    max_range_days: int = 3 * 366

    @property
    def copernicus_configured(self) -> bool:
        return bool(self.copernicus_client_id and self.copernicus_client_secret.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
