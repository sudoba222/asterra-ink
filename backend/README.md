# ASTERRA backend

A small FastAPI service that fetches satellite data for a field with keys the browser must never see.
Live at https://api.asterra.ink (interactive docs: https://api.asterra.ink/api/v1/docs).

## Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/api/v1/health` | `{"status": "ok", "environment": "...", "copernicus": "configured" \| "missing"}` |
| POST | `/api/v1/fields/ndvi` | NDVI of a field over time from Copernicus Sentinel-2 L2A (cloudy pixels removed) |

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
