"""Copernicus Data Space Ecosystem: OAuth token + Sentinel Hub Statistical API (Sentinel-2 L2A NDVI).

Docs: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html
The client secret stays on the server; the browser only ever talks to this backend.
"""

import asyncio
import time
from datetime import date, timedelta

import httpx

from app.config import Settings
from app.errors import ApiError
from app.geometry import Point, close_ring

CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
# ~10 m pixels expressed in degrees (resolution is in units of the request CRS).
RESOLUTION_DEG = 0.0001

# Sentinel-2 Scene Classification (SCL) classes that are not a clear view of the ground:
# 0 no data, 1 saturated/defective, 3 cloud shadow, 8 cloud medium, 9 cloud high, 10 thin cirrus, 11 snow.
NDVI_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
const NOT_CLEAR = [0, 1, 3, 8, 9, 10, 11];
function evaluatePixel(s) {
  const sum = s.B08 + s.B04;
  const ndvi = sum === 0 ? 0 : (s.B08 - s.B04) / sum;
  const clear = s.dataMask === 1 && sum !== 0 && NOT_CLEAR.indexOf(s.SCL) === -1;
  return { ndvi: [ndvi], dataMask: [clear ? 1 : 0] };
}
"""


class CopernicusClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self._settings = settings
        self._transport = transport
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._lock = asyncio.Lock()

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self._settings.http_timeout_seconds, transport=self._transport)

    async def _get_token(self, client: httpx.AsyncClient) -> str:
        async with self._lock:
            if self._token and time.monotonic() < self._token_expires_at:
                return self._token
            try:
                res = await client.post(
                    self._settings.copernicus_token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self._settings.copernicus_client_id,
                        "client_secret": self._settings.copernicus_client_secret.get_secret_value(),
                    },
                )
            except httpx.HTTPError as exc:
                raise ApiError(502, "COPERNICUS_UNREACHABLE", "Copernicus login did not answer.") from exc
            if res.status_code in (400, 401):
                raise ApiError(
                    502, "COPERNICUS_AUTH_FAILED", "Copernicus rejected the server's OAuth client."
                )
            if res.status_code != 200:
                raise ApiError(502, "COPERNICUS_ERROR", f"Copernicus login answered {res.status_code}.")
            body = res.json()
            self._token = body["access_token"]
            # Renew a minute early so a request never starts with an almost-expired token.
            self._token_expires_at = time.monotonic() + max(int(body.get("expires_in", 300)) - 60, 30)
            return self._token

    async def ndvi_statistics(self, ring: list[Point], start: date, end: date, interval_days: int) -> dict:
        """Raw Statistical API answer: one NDVI statistic per interval between start and end (inclusive)."""
        if not self._settings.copernicus_configured:
            raise ApiError(
                503, "COPERNICUS_NOT_CONFIGURED", "Satellite data is not set up on this server yet."
            )

        request = {
            "input": {
                "bounds": {
                    "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in close_ring(ring)]]},
                    "properties": {"crs": CRS84},
                },
                "data": [{"type": "sentinel-2-l2a", "dataFilter": {"mosaickingOrder": "leastCC"}}],
            },
            "aggregation": {
                "timeRange": {
                    "from": f"{start.isoformat()}T00:00:00Z",
                    "to": f"{(end + timedelta(days=1)).isoformat()}T00:00:00Z",
                },
                "aggregationInterval": {"of": f"P{interval_days}D", "lastIntervalBehavior": "SHORTEN"},
                "evalscript": NDVI_EVALSCRIPT,
                "resx": RESOLUTION_DEG,
                "resy": RESOLUTION_DEG,
            },
        }

        async with self._client() as client:
            token = await self._get_token(client)
            try:
                res = await client.post(
                    self._settings.copernicus_statistics_url,
                    json=request,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                )
            except httpx.HTTPError as exc:
                raise ApiError(502, "COPERNICUS_UNREACHABLE", "Copernicus did not answer.") from exc

        if res.status_code == 401:
            self._token = None  # force a new token next time
            raise ApiError(502, "COPERNICUS_AUTH_FAILED", "Copernicus rejected the access token.")
        if res.status_code == 429:
            retry = res.headers.get("Retry-After", "60")
            raise ApiError(
                503,
                "COPERNICUS_BUSY",
                "Copernicus quota or rate limit reached. Try later.",
                {"Retry-After": retry},
            )
        if res.status_code == 400:
            raise ApiError(422, "COPERNICUS_REJECTED_FIELD", "Copernicus could not process this field.")
        if res.status_code != 200:
            raise ApiError(502, "COPERNICUS_ERROR", f"Copernicus answered {res.status_code}.")
        return res.json()
