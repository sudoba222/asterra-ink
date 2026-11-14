# ASTERRA data sources

ASTERRA shows **only real data**. If a source is unavailable, the card says "No data" and the
recommendation says what it can't judge. Nothing is invented or filled with sample values.

## Field dashboard (`POST /api/field-conditions`)

The farmer's saved polygon is sent to the server, which queries three sources in parallel
(`src/entities/field-conditions/api/get-field-conditions.ts`). Each one can fail independently.

### NASA POWER daily point: temperature, rain, soil moisture

- **Parameters:** `T2M`, `T2M_MAX`, `T2M_MIN` (°C), `PRECTOTCORR` (mm/day), `GWETROOT` (root-zone wetness 0–1, shown as % of saturation).
- **Where:** the field's centre; ≈0.5° × 0.625° grid (≈50 km), MERRA-2 reanalysis.
- **When:** the last ~40 days. The newest 2–4 days are not processed yet, so the UI shows "NASA observations until <date>".
- **Endpoint:** `https://power.larc.nasa.gov/api/temporal/daily/point` (no key). Code: `src/shared/api/nasa/power-daily.ts`, cached for a few hours.
- **Limits:** a regional model estimate, not a field sensor. MERRA-2 does not simulate irrigation, so irrigated land in dry regions can read drier than it is. The rules account for this: "irrigate now" also needs a real recent water deficit (see below).
- **Override for testing:** `NASA_POWER_API_ROOT`.

### Reference evapotranspiration (ET₀): derived

- Daily FAO-56 Hargreaves (eq. 52) from POWER `T2M_MAX`/`T2M_MIN` and extraterrestrial radiation for the latitude and day (eq. 21).
- Code: `src/shared/lib/agro.ts`. Accuracy is about ±10–15 %; it is used only to compare crop water use with rain.

### NASA MODIS Terra NDVI via GIBS: crop greenness inside the field

- **Layer:** `MODIS_Terra_NDVI_8Day` (rolling 8-day, ≈250 m), `GoogleMapsCompatible_Level9` tiles.
- **Method:** GIBS renders each product with a published colormap (`colormaps/v1.3/MODIS_NDVI.xml`, 0.005-wide NDVI bins). The server downloads the paletted PNG tiles covering the field, decodes them (`node:zlib`, no extra dependency) and reverse-maps every pixel whose centre lies inside the polygon to its NDVI bin. Transparent and no-data pixels (clouds, water) are skipped.
- **Comparison:** the same date one year earlier (explicit `TIME` request).
- **Small fields:** a field smaller than one 250 m pixel uses the pixel under its centre and is flagged in the UI.
- **Code:** `src/shared/lib/gibs-raster.ts` (pure, unit-tested against a real tile fixture) and `src/shared/api/nasa/gibs-ndvi.ts`.

### Open-Meteo: 3-day forecast (not NASA)

- `precipitation_sum`, `temperature_2m_max/min`, `et0_fao_evapotranspiration` for today and the next 2 days.
- **Endpoint:** `https://api.open-meteo.com/v1/forecast` (free, no key, non-commercial use). Code: `src/shared/api/open-meteo.ts`.
- It is used only for forward-looking advice ("rain expected", "frost possible") and is always labelled as forecast.

## Recommendation rules (`src/entities/field-conditions/lib/assess.ts`)

These are transparent rules of thumb, unit-tested in `assess.test.ts`. There is no LLM involved.

| Card | Rule |
| --- | --- |
| Soil moisture | Dry < 30 % · A bit dry 30–45 % · Good 45–75 % · Very wet > 75 % |
| Crop health | Little or no crop < 0.2 NDVI · Poor < 0.3 · Fair < 0.5 · Healthy ≥ 0.5, plus a comparison with last year |
| Irrigation | Cold season (7-day mean < 5 °C) or no visible crop → not needed. Dry **and** no rain forecast **and** a recent deficit (ET₀ > rain) **and** demand ≥ 1.5 mm/day → **needed within 24 h**. Dry otherwise → check in 2–3 days. A bit dry with a 7-day deficit > 10 mm → soon. Rain ≥ 5 mm forecast → not needed |
| Recommendation | One sentence, by priority: frost → heat → irrigate now → irrigate soon → no crop (pre-sowing advice) → check soon → rain expected → greener/less green than last year → very wet → cold season → all good. It never says "good" if soil data is missing |

## Map and field selection

| What | Source | Notes |
| --- | --- | --- |
| Globe basemap | NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` | Shown when zoomed out |
| Close-up imagery for finding and outlining a field | Esri World Imagery | Sub-metre to ~1 m in most farm regions. Esri's "Map data not yet available" placeholder tiles are discarded (Cesium `DiscardMissingTileImagePolicy`) so the sharpest real level stays visible. Public tiles with attribution; set `NEXT_PUBLIC_ARCGIS_API_KEY` for the keyed production service |
| Map layers on the field page | NASA GIBS MODIS NDVI, SMAP L4 root-zone soil moisture | Viewing only |
| Regions and districts | geoBoundaries gbOpen ADM1/ADM2 | `GET /api/admin-areas`. Downloaded and simplified server-side, cached for weeks (some files are 40 MB+). Districts are matched to regions by centroid-in-polygon because the data has no parent IDs. Licence varies by country (ODbL / CC BY) and is returned with each response. Coverage varies; missing levels are skipped in the UI |
| Countries, flags, country borders | world-countries (ODbL) | Copied into `public/` at install |
| Country under a click on the globe | world-countries borders (same files) | No reverse-geocoding service. At install `public/geo/index.json` (≈40 KB gzipped) lists each country's polygon bounding boxes; a click is matched against those boxes, then tested point-in-polygon against the real (≈1 km simplified) border, which is loaded once and cached |
| Cities and towns | GeoNames (CC BY 4.0) via OpenDataSoft's public mirror *"geonames-all-cities-with-a-population-1000"* | `GET /api/cities?iso=` (500 most populous places), `&q=` (name search for smaller towns) and `&lat=&lon=` (nearest town within 80 km of a click). Why this source: real, worldwide, no API key, and the mirror can answer for one country or one point (≈30 KB) instead of the 3 MB GeoNames dump. City sections, historical, abandoned and destroyed places are excluded. Answers are cached for weeks on the server |
| Space backdrop | Generated in the browser | Seeded star field and three faint distant planets drawn on canvas as Cesium's sky box; Cesium's real-position sun and moon and its sky atmosphere. No external assets |
| Field area | Computed in the browser | Spherical polygon area (Chamberlain & Duquette 2007, as in turf.js v7, mean Earth radius). Checked against an independent planar calculation to within 0.01 % |

## Crop planning ("More details → Plan your next crop")

- NASA POWER monthly point for the field's centre (`GET /api/environment`), with FAO-56 ET₀ and the climatic water balance.
- Crop catalog v0.1 (`src/entities/crop/model/catalog.ts`) gives indicative FAO ECOCROP ranges, marked unverified pending agronomy review. It never ranks by profit without local prices.

## Where fields are stored

`src/entities/field/api/field-repository.ts`: in this browser only (localStorage) for now. To add a backend, implement the
`FieldRepository` interface with `GET/POST/DELETE /api/fields` (e.g. Postgres/PostGIS). Fields can be exported
as GeoJSON from the field page.
