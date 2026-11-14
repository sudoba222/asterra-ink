# ASTERRA backend

FastAPI service for ASTERRA (NASA Space Apps 2026, *Field Shift: Adapting Farms with NASA Data*).
It fetches and normalizes NASA data so the Next.js + CesiumJS frontend never talks to NASA directly,
and runs a transparent, rule-based crop rotation engine.

## Quick start

Requires [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for you).

```bash
uv sync                      # create .venv and install everything (incl. dev tools)
cp .env.example .env         # optional, defaults work
uv run uvicorn app.main:app --reload --port 8000
```

- Interactive docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

```bash
uv run pytest                # tests run offline (NASA calls are mocked)
uv run ruff check .          # lint
uv run python scripts/fetch_boundaries.py   # re-run only after adding countries to countries.json
```

Heavier geospatial libraries (Earth Engine, earthaccess, rasterio, xarray) are optional:
`uv sync --extra geo`. Add a package with `uv add <name>`.

## Connecting the frontend (Next.js + CesiumJS)

The frontend only talks to this API. It never calls NASA POWER directly, and it never needs a
NASA key. Map tiles are the one exception: Cesium loads them straight from NASA GIBS, using the
URLs this API returns.

```
Browser (Next.js on :3000)  ──fetch──▶  ASTERRA API (:8000/api/v1)  ──▶  NASA POWER, GIBS ...
          │
          └── Cesium loads map tiles directly from gibs.earthdata.nasa.gov (URL comes from the API)
```

### 1. Run both apps

| App | Command | URL |
|---|---|---|
| Backend | `uv run uvicorn app.main:app --reload --port 8000` | http://localhost:8000/docs |
| Frontend | `npm run dev` | http://localhost:3000 |

### 2. Point the frontend at the API

Pick **one** of these two options.

**Option A (recommended): Next.js proxy, no CORS setup at all.** In `next.config.js`:

```js
module.exports = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }];
  },
};
```

Then the frontend calls relative URLs like `/api/v1/countries`. To use a deployed backend later,
change only the `destination`.

**Option B: call the backend URL directly.** In the frontend's `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

The backend only accepts browser requests from origins it knows (CORS). `http://localhost:3000`
is allowed by default. For another port or a deployed site, add it in the **backend's** `.env`:

```bash
ASTERRA_CORS_ORIGINS=["http://localhost:3000","http://localhost:3001","https://asterra.vercel.app"]
```

The symptom of a missing origin is a browser console error mentioning "CORS policy", while the
same URL works fine when opened directly in the browser.

### 3. Add one small API client

Create `lib/api.ts` in the frontend so every call handles the response format the same way:

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";   // "/api/v1" with Option A

export type Status = "available" | "partial" | "delayed" | "unavailable" | "not_configured" | "demo";
export type Envelope<T> = { data: T; metadata: { source: string | string[]; lastUpdated: string; status: Status; [k: string]: unknown } };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));            // e.g. proxy error pages are not JSON
  if (!res.ok) {
    const e = body.error ?? {};
    throw new ApiError(res.status, e.code ?? "HTTP_ERROR", e.message ?? res.statusText, e.details);
  }
  return body as Envelope<T>;
}

export const api = {
  countries: () => request<any[]>("/countries"),
  country: (code: string) => request<any>(`/countries/${code}`),
  boundary: (code: string) => request<any>(`/countries/${code}/boundaries`),
  dashboard: (code: string) => request<any>(`/countries/${code}/dashboard`),
  indicators: (code: string) => request<any>(`/countries/${code}/indicators`),
  climate: (code: string, variable: string, q: { from?: string; to?: string; interval?: "daily" | "weekly" | "monthly" } = {}) =>
    request<any>(`/countries/${code}/climate/${variable}?${new URLSearchParams(q as Record<string, string>)}`),
  layers: (code: string) => request<any[]>(`/countries/${code}/map/layers`),
  fieldProfile: (geometry: GeoJSONPolygon) =>
    request<any>("/fields/profile", { method: "POST", body: JSON.stringify({ geometry }) }),
  recommend: (geometry: GeoJSONPolygon, questionnaire: Record<string, unknown>) =>
    request<any>("/recommendations/analyze", { method: "POST", body: JSON.stringify({ field: { geometry }, questionnaire }) }),
};

export type GeoJSONPolygon = { type: "Polygon"; coordinates: [number, number][][] };
```

To replace the `any` types with exact types generated from this API:
`npx openapi-typescript http://localhost:8000/openapi.json -o types/asterra-api.ts`.

### 4. Common frontend tasks

Cesium code must run in a client component (`"use client"`).

**Country picker → fly to the country and highlight it**

```ts
const { data: countries } = await api.countries();           // [{ code, name, flag, center, hasBoundary }]

async function selectCountry(viewer: Cesium.Viewer, code: string) {
  const { data: geojson } = await api.boundary(code);
  const ds = await Cesium.GeoJsonDataSource.load(geojson, {
    stroke: Cesium.Color.YELLOW, fill: Cesium.Color.YELLOW.withAlpha(0.1), strokeWidth: 2,
  });
  viewer.dataSources.removeAll();
  viewer.dataSources.add(ds);
  viewer.flyTo(ds);                                          // camera fits the whole country
}
```

**City or any point (frontend geocodes, then flies there)**

```ts
viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 15000) });  // 15 km up
```

The map layers below work at **any** location on Earth, so no backend call is needed to show
imagery over a city.

**Satellite layers (true color, NDVI, rainfall, soil moisture)**

```ts
const { data: layers } = await api.layers("TJ");             // GIBS layers are global
const active = new Map<string, Cesium.ImageryLayer>();

function toggleLayer(viewer: Cesium.Viewer, layer: any, on: boolean) {
  if (on) {
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: layer.delivery.tileUrl,
      maximumLevel: layer.delivery.maximumLevel,             // Cesium stretches tiles beyond this
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      credit: layer.source,
    });
    active.set(layer.id, viewer.imageryLayers.addImageryProvider(provider));
  } else {
    const l = active.get(layer.id);
    if (l) viewer.imageryLayers.remove(l);
    active.delete(layer.id);
  }
}
```

Each layer also gives `legend.url` (an SVG color scale to show under the map) and `time.default`
(the date shown). For a different date, call `GET /countries/{code}/map/layers/{layerId}?time=YYYY-MM-DD`.

**Dashboard: render what is available**

```ts
const { data } = await api.dashboard("TJ");
for (const [name, section] of Object.entries<any>(data.sections)) {
  // section.status: available | partial | delayed | unavailable | not_configured
  // section.data is null when the section is unavailable or not_configured: show a placeholder, not an error
}
```

**Charts from a time series**

```ts
const { data } = await api.climate("TJ", "precipitation", { from: "2025-01-01", to: "2026-11-01", interval: "monthly" });
const rows = data.points.map((p: any) => ({ x: p.date, y: p.value, partial: !p.complete }));
// Draw partial periods differently (lighter or dashed): NASA has not published every day yet.
// value can be null for missing data: leave a gap, don't draw it as 0.
```

**Farmer draws a field → crop recommendations**

Cesium gives Cartesian3 positions. The API wants GeoJSON with `[longitude, latitude]` pairs and the
first point repeated at the end:

```ts
function toGeoJSON(positions: Cesium.Cartesian3[]): GeoJSONPolygon {
  const ring = positions.map((p) => {
    const c = Cesium.Cartographic.fromCartesian(p);
    return [Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)] as [number, number];
  });
  ring.push(ring[0]);                                        // close the ring
  return { type: "Polygon", coordinates: [ring] };
}

const { data } = await api.recommend(toGeoJSON(drawnPositions), {
  previousCrops: ["wheat", "unknown"],    // most recent first; "unknown" is allowed
  irrigation: "irrigated",                // rainfed | irrigated | both | unknown
  plantingDate: "2027-04-15",
  priority: "soil_health",                // profit | yield | water_saving | soil_health | low_risk
  pestOrDiseaseIssues: ["rust"],
});
// data.recommendations[]: { rank, name, score, reasons[{ kind, message }], economics, season }
// data.excluded[]: crops ruled out, with the reason
// data.confidence: { score, level }, data.missingInputs[]: questions the farmer skipped
```

`/fields/profile` and `/recommendations/analyze` work for **any** field on Earth, not only the 10
listed countries.

### 5. Rules for the UI

- **Always check `status`.** Show `not_configured` as "coming soon", `delayed` as "latest days not
  published yet", `demo` with a visible "example data" label. Never present `demo` as real.
- **Show the source.** Every response has `metadata.source`; display it under charts and cards.
- **Handle errors by `error.code`**, not by message text: `NOT_FOUND`, `VALIDATION_ERROR`,
  `DATA_SOURCE_UNAVAILABLE`, `BOUNDARY_NOT_AVAILABLE`.
- **First requests can take a few seconds** (NASA POWER is slow); repeat requests are cached and
  instant. Show a loading state.
- **Rainfall change:** prefer `change` (absolute mm) over `changePercent`.

### 6. Working without conflicts

- The contract is http://localhost:8000/openapi.json (or the `/docs` page). Agree on any new
  endpoint there before either side builds it.
- The backend only **adds** endpoints and fields; existing names do not change without telling
  the frontend first.
- Testing from another laptop on the same Wi-Fi: start the backend with
  `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` and use
  `http://<backend-laptop-ip>:8000` (find the IP with `ipconfig getifaddr en0` on macOS).

## Folder structure

```
app/
  main.py                 app factory: CORS, gzip, error handlers, /api/v1 router
  core/
    config.py             settings from env vars (ASTERRA_*)
    responses.py          {data, metadata} envelope, DataStatus / ValueKind vocabularies
    errors.py             {error: {code, message, details}} envelope + exception types
    cache.py              @cached decorator (disk cache, survives --reload)
    http.py               shared httpx client + retries (429 / 5xx / network)
  providers/              one module per external source; the only code that knows NASA formats
    nasa_power.py         daily point data (temperature, rain, humidity, solar, modeled soil wetness)
    gibs.py               GIBS WMTS layer catalog + tile URL templates for Cesium
  services/               business logic: combines providers into API-shaped data
    countries.py          country list, regions (agricultural sample points), boundaries
    timeseries.py         pure helpers: average points, roll up daily -> weekly/monthly
    climate.py            series, indicators, 12-month climate summary
    dashboard.py          one-call dashboard; each section fails independently
    data_sources.py       source registry + live status checks
    fields.py             field polygon -> centroid/area, season climate windows
  engine/                 crop rotation rule engine (pure, no network)
    catalog.py            loads data/crops.json
    pipeline.py           constraints -> rotation -> economics -> weighted ranking
  schemas/fields.py       request models (field polygon, questionnaire)
  api/v1/                 thin HTTP routes: validate input, call services, wrap in envelope
  data/
    countries.json        countries, camera centers, agricultural sample points
    crops.json            starter crop catalog (UNVERIFIED, needs agronomy review)
    boundaries/           GeoJSON per country (generated by scripts/fetch_boundaries.py)
scripts/                  one-off data prep
tests/                    pytest; conftest mocks NASA POWER and GIBS with respx
```

The rule of thumb: **routes -> services -> providers**. Routes never call NASA. Providers never
know about countries or crops. The engine never does I/O, so it is easy to test.

## Endpoints (all under `/api/v1`)

| Method | Path | Status |
|---|---|---|
| GET | `/health` | live |
| GET | `/data-sources`, `/data-sources/status` | live (real checks, 5 min cache) |
| GET | `/countries`, `/countries/{code}` | live |
| GET | `/countries/{code}/boundaries` | live (GeoJSON committed in `app/data/boundaries/`) |
| GET | `/countries/{code}/map/regions` | live (agricultural sample points) |
| GET | `/countries/{code}/dashboard` | live, partial sections |
| GET | `/countries/{code}/indicators[/{name}]` | temperature, precipitation, soil moisture live; vegetation, ET, water `not_configured` |
| GET | `/countries/{code}/climate/{variable}?from&to&interval&regionId` | live (`temperature`, `temperature-max`, `temperature-min`, `precipitation`, `humidity`, `solar-radiation`, `soil-moisture`, `surface-soil-moisture`) |
| GET | `/countries/{code}/climate/summary` | live (last 12 months vs previous 4 years) |
| GET | `/countries/{code}/map/layers[/{layerId}]?time` | live GIBS tiles: `true-color`, `vegetation`, `precipitation`, `soil-moisture` |
| GET | `/countries/{code}/crops[/{cropId}]` | catalog, flagged `demo` until reviewed |
| POST | `/countries/{code}/crop-recommendations/analyze` | live (API-spec body, regional point) |
| POST | `/fields/profile` | live (field polygon) |
| POST | `/recommendations/analyze` | live (field polygon + questionnaire) |

Insights, risk assessment and impact summary are stubs returning `not_configured` (priority 2).

### Example: field recommendation

```bash
curl -X POST localhost:8000/api/v1/recommendations/analyze -H 'content-type: application/json' -d '{
  "field": {"geometry": {"type": "Polygon", "coordinates": [[[68.770,37.830],[68.780,37.830],[68.780,37.838],[68.770,37.838],[68.770,37.830]]]}},
  "questionnaire": {"previousCrops": ["wheat","wheat"], "irrigation": "irrigated",
                    "plantingDate": "2027-04-15", "priority": "soil_health", "pestOrDiseaseIssues": ["rust"]}
}'
```

Frontend usage for every endpoint is in [Connecting the frontend](#connecting-the-frontend-nextjs--cesiumjs).

## Conventions (from the ASTERRA API spec)

- Success: `{"data": ..., "metadata": {"source", "lastUpdated", "status", ...}}`. Errors: `{"error": {"code", "message", "details?"}}`.
- JSON is camelCase. Python is snake_case (pydantic aliases do the mapping).
- `status` is one of `available | partial | delayed | unavailable | not_configured | demo`.
- `valueKind` separates `observed | calculated | estimated | modeled | demo`. NASA POWER values are `modeled`.
- No silent interpolation. Aggregated points carry `validDays`, `expectedDays` and `complete`.
- A source is never reported `available` without a live check.
- Economics only appears when the farmer gives yield, price and cost. Otherwise it is `omitted`.

## Design decisions worth knowing

- **Countries are sampled at agricultural points, not the geometric center.** Tajikistan's center
  is at 3,368 m in the Pamirs (mean temperature 0.5 °C). `countries.json` lists hand-picked farming
  regions instead. Upgrade path: sample cropland pixels from ESA WorldCover.
- **Indicators compare with the same month last year**, not the previous month, so normal seasons
  don't look like change. Use `change` (absolute) over `changePercent` for rainfall: tiny baselines
  inflate percentages.
- **POWER soil wetness is a MERRA-2 model value, not SMAP.** It is labeled that way. Real SMAP values
  need Earthdata (see next steps). The SMAP *map layer* via GIBS is real SMAP L4.
- **Engine confidence is capped at "medium"** while `crops.json` has `reviewStatus: "unverified"`.

## How to add a data source

1. Add `app/providers/<source>.py` with async fetch functions (decorate expensive ones with
   `@cached`) and a `check_status()`. Raise `DataSourceUnavailable` on failures.
2. Register it in `services/data_sources.py` (`SOURCES` + `_CHECKS`).
3. Use it from a service. Wrap optional sources so failure becomes a `not_configured` or
   `unavailable` section, never a crashed request.
4. Add a test with the HTTP call mocked via `respx` (see `tests/conftest.py`).

## Roadmap

Ordered by what the demo needs most. The acceptance criteria require one real field to work end
to end, so items 1-3 come before new data sources.

### Now: connect and demo
1. **Connect the frontend** using the section above, and run one full flow together: pick a country,
   show layers, draw a field, get recommendations.
2. **Choose the demo field**: one real field whose crop history the team knows, and save its
   polygon and questionnaire as a fixture in `tests/`. Every later change must keep it working.
3. **Deploy the backend** so the frontend does not depend on one laptop. Free options: Render,
   Railway or Fly.io, all of which run the included `Dockerfile`. Then add the frontend's deployed
   URL to `ASTERRA_CORS_ORIGINS`.

### Next: support the location picker
4. **Coordinate-based endpoints** for any city:
   `GET /locations/indicators?lat&lon`, `GET /locations/climate/{variable}?lat&lon`.
   Until then, `/fields/profile` with a small polygon around the point returns climate anywhere.
5. **High-resolution imagery for zoomed-in views**: add NASA GIBS HLS layers
   (`HLS_S30_Nadir_BRDF_Adjusted_Reflectance`, `HLS_L30_...`, 30 m, zoom 12) next to the MODIS layers.
6. **"Best imagery date" endpoint** (`GET /imagery/latest?lat&lon`): HLS has data only on days a
   satellite passed over, and blank tiles on other days. Scan the last ~30 days and return dates
   with real pixels.

### Then: make recommendations stronger
7. **Agronomy review of `data/crops.json`**: verify ranges, add crops grown in the demo region, cite
   sources, set `reviewStatus: "reviewed"`. Replace substring pest matching with explicit
   pest-to-crop host lists (today "rust" matches both wheat rust and bean rust, which are
   different pathogens).
8. **NDVI per field**: Sentinel-2 or HLS time series via Google Earth Engine (`--extra geo`, set
   `ASTERRA_GEE_PROJECT`) or the NASA AppEEARS API. This is the biggest missing core source.
9. **SRTM slope** via Earth Engine, then a slope or erosion warning in the engine.
10. **FAO GAEZ suitability** to generate candidates instead of using the whole catalog.
11. **SMAP / GPM IMERG values** via `earthaccess` (needs a free Earthdata login).

### Optional
12. LLM explanation layer (`--extra llm`) that only rephrases `reasons` and never changes scores.
13. Insights, risk assessment and impact summary endpoints (priority 2 in the API spec).
