# ASTERRA backend

A small FastAPI service that fetches satellite data for a field with keys the browser must never see.
Live at https://api.asterra.ink (interactive docs: https://api.asterra.ink/api/v1/docs).

## Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/api/v1/health` | `{"status": "ok", "environment": "...", "copernicus": "configured" \| "missing"}` |
| POST | `/api/v1/fields/ndvi` | NDVI of a field over time from Copernicus Sentinel-2 L2A (cloudy pixels removed) |
| POST | `/api/v1/fields/terrain` | Slope, height and water-erosion risk of a field from NASA NASADEM (30 m). Body `{"polygon": [[lon, lat], ...]}` |
| GET | `/api/v1/water/trend?lat=&lon=` | Trend of water stored on and under the land from NASA/JPL GRACE & GRACE-FO (≈300 km), cm/year |

### `POST /api/v1/fields/ndvi`

Request. The polygon uses the same `[[lon, lat], ...]` format as the frontend's `/api/land-suitability`:
```json
{
  "polygon": [[68.78, 38.56], [68.79, 38.56], [68.79, 38.57], [68.78, 38.57]],
  "from": "2025-01-01",
  "to": "2025-12-31",
  "intervalDays": 10
}
```
`from`/`to` are optional (default: the last 12 months). `intervalDays` is 5–31 (default 10; Sentinel-2 passes about every 5 days).

Answer:
```json
{
  "source": "Copernicus Sentinel-2 L2A (ESA), Copernicus Data Space Ecosystem Statistical API",
  "areaHectares": 95.12,
  "intervalDays": 10,
  "series": [
    {"from": "2025-06-01", "to": "2025-06-10", "ndviMean": 0.61, "ndviMin": 0.1, "ndviMax": 0.82, "ndviStd": 0.09, "clearShare": 0.8},
    {"from": "2025-06-11", "to": "2025-06-20", "ndviMean": null, "ndviMin": null, "ndviMax": null, "ndviStd": null, "clearShare": 0}
  ]
}
```
- `ndviMean` `null` = no clear view in that period (clouds). Skip it in charts, don't draw it as 0.
- `clearShare` = share of the field seen without cloud (0–1). Below ~0.3 the value is less reliable.
- Rough reading: NDVI below 0.2 = bare soil, 0.2–0.5 = sparse or young crop, above 0.5 = dense green crop.

Errors always look like `{"error": {"code": "...", "message": "..."}}`:

| Status | Code | When |
|---|---|---|
| 422 | `VALIDATION_ERROR` | fewer than 3 corners, outline crosses itself, bad coordinates or dates (`details` says which field) |
| 422 | `FIELD_TOO_LARGE` / `RANGE_TOO_LONG` | over 5,000 ha, or over ~3 years in one request (protects the free quota) |
| 503 | `COPERNICUS_NOT_CONFIGURED` | the server has no Copernicus keys yet |
| 503 | `COPERNICUS_BUSY` | Copernicus quota or rate limit; see the `Retry-After` header |
| 502 | `COPERNICUS_AUTH_FAILED` / `COPERNICUS_ERROR` / `COPERNICUS_UNREACHABLE` | problem on the Copernicus side |

Answers are cached on disk (1 day; 30 days for periods fully in the past), so asking for the same field again is instant and free.

## Run locally

```bash
cd backend
cp .env.example .env        # put your OWN Copernicus OAuth client here (dashboard → User settings → OAuth clients)
uv sync
uv run uvicorn app.main:app --reload
```
Open http://localhost:8000/api/v1/docs. The frontend at http://localhost:3000 is allowed by CORS.

## Checks (the same as CI)

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest -q
```
Tests never call Copernicus; they use a fake that answers like it.

## Files

| File | What |
|---|---|
| `app/main.py` | app, CORS, health |
| `app/config.py` | settings from `.env` (all names start with `ASTERRA_`) |
| `app/fields.py` | `/fields/ndvi`: limits, cache, answer format |
| `app/copernicus.py` | OAuth token (reused until it expires) + Statistical API request and NDVI evalscript |
| `app/geometry.py` | polygon checks and area in hectares |
| `app/schemas.py` | request and answer models |
| `app/errors.py` | one error format for everything |

## NASA Earthdata (terrain and water trend)

Both need `ASTERRA_EARTHDATA_TOKEN` (https://urs.earthdata.nasa.gov → Generate Token; it expires every 60 days). Without it they answer `503 EARTHDATA_NOT_CONFIGURED`; an expired token gives `502 EARTHDATA_AUTH_FAILED`. Health shows `"earthdata": "configured" | "missing"`.

- **Terrain:** downloads the field's 1° NASADEM tile once (~11 MB zip → 26 MB grid in the cache volume), then reads only the rows under the field. Heights have a few metres of noise, so field slope = tilt of a least-squares plane through the field (at least 330 × 330 m for small fields), and steep parts = Horn's method on ≈ 90 m block means. A flat polder reads ≈ 0 %. Erosion risk (indicative): high if mean slope ≥ 5 % or ≥ 30 % of the field steeper than 5 %; moderate if mean ≥ 2 % or ≥ 10 % steeper than 5 %; low otherwise.
- **Water trend:** finds the newest JPL mascon file in NASA's catalog (CMR), downloads it once per release (~44 MB), reads one 0.5° cell. Least-squares trend over the whole record; falling ≤ −0.5 cm/yr, rising ≥ +0.5 cm/yr. GRACE sees total water storage (groundwater + soil + snow + surface) over ≈300 km, not one field.
