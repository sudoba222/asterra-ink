# ASTERRA

**Agriculture intelligence from NASA Earth observation data.** NASA Space Apps 2026 · Field Shift.

A farmer opens the site, finds their exact field on high-resolution satellite imagery, marks its
boundary, and gets **four simple cards and one clear recommendation** based on real NASA data.

> Decision support, not a guarantee. Only real data is shown; when a source is missing the app says so.

## Run it

```bash
npm install        # also copies Cesium, country borders and flags into /public (git-ignored)
npm run dev        # http://localhost:3000
npm test           # unit tests (field area, GIBS NDVI decoding, recommendation rules)
npm run lint && npm run typecheck
npm run build && npm start
```

If an API call shows **"couldn't be reached (404)"** or a code change doesn't show up, the
Turbopack dev cache in `.next/dev` is stale (e.g. after files were added or moved while the server
was running). Run `npm run dev:clean` to clear it and restart.

Node 20+. No API keys are required. Optional environment variables:
`NEXT_PUBLIC_ARCGIS_API_KEY` (keyed Esri imagery for production), `NASA_POWER_API_ROOT` and
`OPEN_METEO_BASE_URL` (point to another host, e.g. to test outages).

## The farmer flow

| Step | Where | What happens |
| --- | --- | --- |
| 1. Country | `/` | Search by name or code, or press **Use my location** (browser geolocation flies straight to you) |
| 2. Region → 3. District | `/country/[ISO3]` | Searchable lists from geoBoundaries. The camera flies to each and outlines it. Either step can be skipped |
| 4–5. Find the field | map | Esri World Imagery appears when you zoom in. Use **+ / −**, scroll or pinch |
| 6. Mark the field | map | **Mark my field** → tap each corner → **Finish** |
| 7. Area | toolbar | Live hectares while you draw and edit |
| 8. Edit / clear / confirm | toolbar | Drag corners, drag midpoints to add corners, double-click to remove one. Crossing edges block Confirm |
| 9. Save | dialog → `/field/[id]` | Name it and save. The polygon is used to fetch the field's data. Saved fields are listed on the home screen and can be edited, exported as GeoJSON or deleted |

### The field dashboard

- **Smart recommendation:** one sentence (e.g. *"Your soil moisture is low. Irrigate your field within the next 24 hours."*) with a **Why?** that cites the numbers and dates.
- **Four cards:** Temperature · Soil moisture · Crop health · Irrigation, each a plain word, one number and one sentence.
- **More details** (collapsed): last 30 days of rain and soil moisture plus the 3-day forecast, crop health vs last year, *Plan your next crop* (the crop-rotation questionnaire and rule engine), and field info and data sources.

Data: NASA POWER daily (temperature, rain, root-zone soil moisture), NASA MODIS NDVI read from GIBS
tiles **inside the farmer's polygon**, FAO-56 ET₀, and an Open-Meteo 3-day forecast (labelled as forecast).
See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for every source, its limits and the exact rules.

## Architecture: Feature-Sliced Design on the Next.js App Router

```
app/                          Next.js routing only
  (explore)/layout.tsx        one persistent globe + providers (map, field draft)
  (explore)/page.tsx          → views/explore        (home: find your field, my fields)
  (explore)/country/[iso]/    → views/field-finder   (region → district → mark)
  (explore)/field/[id]/       → views/field          (simple dashboard)
  api/admin-areas             regions/districts (geoBoundaries, cached)
  api/field-conditions        real data for a polygon (POWER, GIBS NDVI, Open-Meteo)
  api/environment             monthly climate profile for crop planning
src/
  app/        providers, ExploreShell (map container, zoom, draw toolbar), tokens
  views/      explore, field-finder, field
  widgets/    earth-globe (creates the Cesium viewer), country-selector, field-dashboard, crop-rotation
  features/   draw-field (Cesium draw/edit controller + toolbar + save), select-admin-area,
              locate-me, switch-map-layer, select-country, fill-farmer-questionnaire
  entities/   map (viewer context, camera helpers, outlines, zoom), field (model, area, validation,
              repository), field-conditions (types + rules), country, climate, crop, satellite-layer, exploration
  shared/     ui, lib (geo, FAO-56, GIBS raster decoding, Cesium loader), api (NASA, Open-Meteo, geoBoundaries)
```

Key decisions:

- **Map logic is separate from React UI.** `widgets/earth-globe` only creates the viewer and publishes it through `entities/map`. Field drawing is a framework-free class (`features/draw-field/lib/draw-controller.ts`) wrapped by a small React context.
- **Cesium without bundling or ion.** The prebuilt `Cesium.js` is loaded from `/public/cesium` at runtime by a client-only component.
- **Cache Components.** Pages declare their layout mode (`useShellMode`) instead of the layout reading the URL. `params` are resolved inside `<Suspense>`. Server adapters use `"use cache"`.
- **Tested logic:** `vitest` covers field area and self-intersection, GIBS PNG decoding and colormap reverse-mapping (real tile fixture), and every recommendation branch.

## Known limitations

- Soil moisture is a ≈50 km NASA model estimate, and MODIS NDVI is 250 m. Small fields are flagged as smaller than a pixel.
- NASA POWER daily data lags 2–4 days; forward-looking advice relies on the labelled Open-Meteo forecast.
- Fields are saved in this browser only until a backend implements `FieldRepository`.
- geoBoundaries district coverage varies by country; missing levels are skipped.
- Esri public tiles suit demos; use a free ArcGIS key (`NEXT_PUBLIC_ARCGIS_API_KEY`) in production.
- The crop catalog for "Plan your next crop" is indicative and awaits agronomy review.

## Credits

NASA POWER, NASA GIBS / EOSDIS (MODIS, SMAP, Blue Marble), Esri World Imagery, geoBoundaries, Open-Meteo, CesiumJS (Apache-2.0), world-countries (ODbL), FAO-56 and FAO ECOCROP.
