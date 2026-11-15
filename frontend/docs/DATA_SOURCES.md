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

## Land check before crop planning (`POST /api/land-suitability`)

Before any crop is recommended, the saved polygon is checked to confirm it is land that can be farmed
(`src/entities/land-suitability`). The check uses land-cover and map data only, never climate. It runs on
the **whole polygon**, not just its centre.

| Source | What it sees | How |
| --- | --- | --- |
| ESA WorldCover 2021 v200 (10 m, Copernicus Sentinel-1/2, CC BY 4.0) | Built-up, permanent water, snow/ice, cropland… | Public Cloud-Optimised GeoTIFFs on AWS Open Data (no key). The server reads the header, then only the 1024² tiles under the field (HTTP range requests, `node:zlib`, no extra dependency). It counts every pixel whose centre is inside the polygon, and uses an overview level for very large fields. Code: `src/shared/lib/cog-raster.ts`, `src/shared/api/esa-worldcover.ts` |
| OpenStreetMap via Overpass (ODbL) | Building footprints, lakes/reservoirs/riverbanks, rivers and canals, roads (by width/lanes), rail, runways, parking, non-farm land use (industrial, cemetery, quarry…) | Features crossing the polygon plus large areas enclosing its centre. A grid of up to 2,500 points (≥ 1 m apart) is tested against them; lines count within half their width. Farm tracks, paths, ditches, tunnels and seasonal water are ignored. Residential land only adds a note, because household plots are farmed. Code: `src/shared/api/osm-overpass.ts`, `src/entities/land-suitability/lib/osm-coverage.ts`. Endpoints are tried in order (`OVERPASS_API_URL`, comma-separated) |

**Rules** (`lib/classify.ts`, unit-tested):

- `unsuitable_land`: mapped OSM geometry covers ≥ 50 % of the field, **or** WorldCover water/built-up/snow covers ≥ 70 %, **or** OSM ≥ 30 % and WorldCover ≥ 50 % together. The reason is `building_detected`, `water_detected`, `infrastructure_detected`, `built_up_area_detected` or `non_agricultural_land_use`. The crop engine is then **not run** (`evaluateFieldRotation` in `entities/crop/lib/land-gate.ts`): no candidates, scores or notes.
- `uncertain`: data is missing (`land_cover_unavailable`), or the sources disagree (`sources_disagree`: e.g. satellite built-up but no mapped buildings, which is typical for plastic greenhouses), or the cover is mixed at 50–70 % (`mixed_land_cover`). Without OSM, WorldCover must show ≥ 50 % cropland to confirm the land, because 10 m pixels miss narrow roads and streets under trees. Crops are still shown, with a caution.
- `suitable`: partial cover ≥ 10 % (e.g. a farmhouse) is added as a note to the crop plan.
- **Limits:** WorldCover reflects 2021; OSM completeness varies by region. Public Overpass servers are often at capacity, so for production point `OVERPASS_API_URL` at your own instance.

## Crop planning ("More details → Plan your next crop")

- NASA POWER monthly point for the field's centre (`GET /api/environment`), with FAO-56 ET₀ and the climatic water balance.
- Crop catalog v0.1 (`src/entities/crop/model/catalog.ts`) gives indicative FAO ECOCROP ranges, marked unverified pending agronomy review. It never ranks by profit without local prices.

## Where fields are stored

`src/entities/field/api/field-repository.ts`: in this browser only (localStorage) for now. To add a backend, implement the
`FieldRepository` interface with `GET/POST/DELETE /api/fields` (e.g. Postgres/PostGIS). Fields can be exported
as GeoJSON from the field page.

## Rotation strategies (`compareStrategies`, no AI)

`src/entities/crop/lib/compare-strategies.ts` builds three 3-season plans and runs every season through the same rule engine as the crop ranking (`evaluateRotation`), so all checks and points are the documented ones above.

| Strategy | Rule |
| --- | --- |
| As now | The last two crops continued (last A, before B → B, A, B). Unknown history → not shown, asks for it |
| Water-saving | Best-scoring crop with low water need (low or medium if irrigated) that passes the climate checks; no family back before its rest period (`FAMILY_ROTATION`) |
| Soil-health | Legume early (not right after a legume), no family back before its rest period, ranked by score + 2 × soil value (legume +1, deep roots +1, high residue +1 / medium +0.5) |

**On the field page** (`getStrategyComparison` in `strategy-comparison-source.ts`, fed by `views/field/model/use-strategy-evidence.ts`) the strategies run on real data only:
`compareStrategies(profile, ctx, fieldEvidence(ctx, ndvi, [...trend.evidence, ...smap.evidence], terrain, water))`, with Sentinel-2 NDVI (`POST /api/field-ndvi`, shared with the NDVI chart), the 20-year trend (`GET /api/climate-trend`), SMAP (`GET /api/smap`), slope (`POST /api/field-terrain`) and the GRACE water trend (`GET /api/water-trend`). Each source is optional: the plans appear as soon as the planning climate is loaded and update as each source arrives. A source that fails is left out and named ("Not available right now: …") on screen and in the PDF. There is no sample-data fallback. The PDF waits until every source has answered or failed.

Each plan returns why / evidence (with source) / benefits / what we don't know / check locally, a confidence level with its reason, and metrics (water, legume seasons, family repeats, climate-fit seasons, bare months, risk flags).

**12-month strip.** Above the cards, "Your field's year" draws `fieldCalendar()` month by month (Bare / Frost / Hot / Dry, rules below; dashed = no clear satellite view). Each card has a Jan–Dec bar with one row per season showing the months its crop is in the ground (`monthsInGround`), with the field's frost, hot or dry months marked underneath. The PDF has the same strip as a table plus an "In the ground (J–D)" column per season. "Fits your goal": water → Water-saving, soil → Soil-health, risk → fewest risk flags, yield/profit → most climate-fit seasons (ties: fewer risks, then fewer family repeats). Crop facts `rootDepth`, `residue`, `forage` in the catalog are indicative.

## Field calendar (`fieldCalendar`, `fieldEvidence`)

`src/entities/crop/lib/field-calendar.ts`. Months 1–12.

| Flag | Rule |
| --- | --- |
| Bare | Median clear Sentinel-2 NDVI of the month below 0.2 (views with ≥ 30 % of the field clear) |
| Frost | Coldest hour of the month below 0 °C (POWER monthly T2M_MIN) |
| Hot | Hottest hour of the month at least 40 °C (POWER monthly T2M_MAX is the month's peak, not a typical day) |
| Dry | Rain below half of reference ET₀ |

"Turned green" = NDVI rose above 0.4 after being below 0.3 (≈ crops in 12 months).

## 20-year climate trend (`GET /api/climate-trend?lat=&lon=`)

NASA POWER monthly T2M, T2M_MIN, PRECTOTCORR, 2005 to the last full year (no key, cached a day). Compares the first 5 years with the last 5 (annual mean temperature, three warmest months, annual rain, frost months per year) plus a least-squares temperature trend per decade. Rain varies a lot between years, so the answer also names the driest and wettest year. Code: `src/entities/climate/lib/climate-trend.ts`.

## NASA SMAP soil moisture as evidence (`GET /api/smap?lat=&lon=`)

SMAP L4 analyzed root-zone soil moisture (`SMAP_L4_Analyzed_Root_Zone_Soil_Moisture`, 9 km, daily) read from NASA GIBS paletted tiles through the official colormap (`SMAP_Analyzed_Soil_Moisture.xml`, m³/m³), same method as the MODIS NDVI reader. No key. Latest day plus the same day a year earlier; GIBS has gaps (e.g. 10 Oct–11 Dec 2025), so the nearest available day within ±5 weeks is used and its date is shown. Rule: a change of 10 % or more is "drier" / "wetter". Answers `{ now, lastYear, evidence }`; pass `evidence` to `fieldEvidence(ctx, ndvi, [...trend.evidence, ...smap.evidence])`. Code: `src/shared/api/nasa/gibs-smap.ts`, `src/entities/climate/lib/smap-evidence.ts`.

## Slope and regional water (NASA Earthdata, via the backend)

- `POST /api/field-terrain` → backend `POST /fields/terrain`: NASA NASADEM (SRTM, 30 m) slope, height and erosion risk.
- `GET /api/water-trend?lat=&lon=` → backend `GET /water/trend`: NASA/JPL GRACE & GRACE-FO water-storage trend.
- Both go into the strategies: `fieldEvidence(ctx, ndvi, [...trend.evidence, ...smap.evidence], terrain, water)`. High erosion risk explains Soil-health and warns the others; falling water storage explains Water-saving and flags plans with high-water crops. Rules: `backend/README.md`.
