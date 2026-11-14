"""Disk-backed cache for expensive provider calls.

diskcache survives `uvicorn --reload` restarts, which matters because NASA POWER
requests take seconds. Swap for Redis if you deploy multiple instances.
"""

import functools
import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import Any, ParamSpec, TypeVar

import diskcache

from app.core.config import get_settings

P = ParamSpec("P")
R = TypeVar("R")

_cache: diskcache.Cache | None = None


def get_cache() -> diskcache.Cache:
    global _cache
    if _cache is None:
        _cache = diskcache.Cache(str(get_settings().cache_dir))
    return _cache


def _key(prefix: str, args: tuple, kwargs: dict) -> str:
    raw = json.dumps([args, kwargs], sort_keys=True, default=str)
    return f"{prefix}:{hashlib.sha256(raw.encode()).hexdigest()}"


def cached(prefix: str, ttl: int | None = None):
    """Cache the result of a module-level async function. Exceptions are never cached.

    Arguments must be JSON-friendly (str, numbers, dates, lists) since they form the key.
    """

    def decorator(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @functools.wraps(fn)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            cache = get_cache()
            key = _key(prefix, args, kwargs)
            hit: Any = cache.get(key)
            if hit is not None:
                return hit
            result = await fn(*args, **kwargs)
            cache.set(key, result, expire=ttl or get_settings().cache_ttl_seconds)
            return result

        return wrapper

    return decorator
