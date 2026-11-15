import json
from collections.abc import Callable, Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.copernicus import CopernicusClient
from app.grace import GraceClient
from app.main import create_app
from app.terrain import NasademClient

FIELD = [[68.78, 38.56], [68.79, 38.56], [68.79, 38.57], [68.78, 38.57]]  # ~95 ha near Dushanbe


def stats_answer() -> dict:
    """Shape of a real Statistical API answer: one clear interval, one fully cloudy, one with an error."""
    return {
        "status": "OK",
        "data": [
            {
                "interval": {"from": "2025-06-01T00:00:00Z", "to": "2025-06-11T00:00:00Z"},
                "outputs": {
                    "ndvi": {
                        "bands": {
                            "B0": {
                                "stats": {
                                    "min": 0.1,
                                    "max": 0.82,
                                    "mean": 0.61234,
                                    "stDev": 0.09,
                                    "sampleCount": 1000,
                                    "noDataCount": 200,
                                }
                            }
                        }
                    }
                },
            },
            {
                "interval": {"from": "2025-06-11T00:00:00Z", "to": "2025-06-21T00:00:00Z"},
                "outputs": {
                    "ndvi": {
                        "bands": {
                            "B0": {
                                "stats": {
                                    "min": "NaN",
                                    "max": "NaN",
                                    "mean": "NaN",
                                    "stDev": "NaN",
                                    "sampleCount": 1000,
                                    "noDataCount": 1000,
                                }
                            }
                        }
                    }
                },
            },
            {
                "interval": {"from": "2025-06-21T00:00:00Z", "to": "2025-06-26T00:00:00Z"},
                "error": {"type": "EXECUTION_ERROR"},
            },
        ],
    }


class FakeCopernicus:
    """Records requests and answers like Copernicus would."""

    def __init__(self, stats_status: int = 200, token_status: int = 200):
        self.stats_status = stats_status
        self.token_status = token_status
        self.calls: list[tuple[str, dict | None]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            self.calls.append(("token", None))
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_client"})
            return httpx.Response(200, json={"access_token": "test-token", "expires_in": 600})
        self.calls.append(("stats", json.loads(request.content)))
        assert request.headers["Authorization"] == "Bearer test-token"
        if self.stats_status != 200:
            return httpx.Response(self.stats_status, headers={"Retry-After": "120"}, json={})
        return httpx.Response(200, json=stats_answer())

    def count(self, kind: str) -> int:
        return sum(1 for k, _ in self.calls if k == kind)


@pytest.fixture
def make_client(tmp_path) -> Iterator[Callable[..., tuple[TestClient, FakeCopernicus]]]:
    clients: list[TestClient] = []

    def factory(
        configured: bool = True, earthdata: bool = False, nasadem=None, grace=None, **fake_kwargs
    ) -> tuple[TestClient, FakeCopernicus]:
        settings = Settings(
            _env_file=None,
            cache_dir=str(tmp_path / "cache"),
            copernicus_client_id="id" if configured else "",
            copernicus_client_secret="secret" if configured else "",
            earthdata_token="edl-token" if earthdata else "",
        )
        fake = FakeCopernicus(**fake_kwargs)
        app = create_app()
        app.dependency_overrides[get_settings] = lambda: settings
        client = TestClient(app, raise_server_exceptions=False)
        client.__enter__()
        app.state.copernicus = CopernicusClient(settings, transport=httpx.MockTransport(fake))
        if nasadem is not None:
            app.state.nasadem = NasademClient(settings, transport=httpx.MockTransport(nasadem))
        if grace is not None:
            app.state.grace = GraceClient(settings, transport=httpx.MockTransport(grace))
        clients.append(client)
        return client, fake

    yield factory
    for c in clients:
        c.__exit__(None, None, None)
