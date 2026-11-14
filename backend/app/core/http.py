"""One shared httpx client for the whole app (connection pooling), with retries."""

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import get_settings

_client: httpx.AsyncClient | None = None


async def start_http_client() -> None:
    global _client
    _client = httpx.AsyncClient(
        timeout=get_settings().http_timeout_seconds,
        headers={"User-Agent": "asterra-backend/0.1 (NASA Space Apps 2026)"},
        follow_redirects=True,
    )


async def stop_http_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def get_client() -> httpx.AsyncClient:
    if _client is None:  # e.g. scripts/tests that skip the lifespan
        raise RuntimeError("HTTP client not started; call start_http_client() first")
    return _client


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return False


async def get_json(url: str, params: dict | None = None, attempts: int = 3) -> dict:
    """GET JSON with exponential backoff on network errors, 429 and 5xx."""
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(attempts),
        wait=wait_exponential(multiplier=1, max=8),
        retry=retry_if_exception(_retryable),
        reraise=True,
    ):
        with attempt:
            resp = await get_client().get(url, params=params)
            resp.raise_for_status()
            return resp.json()
    raise AssertionError("unreachable")
