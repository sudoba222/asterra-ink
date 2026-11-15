/**
 * NASA GIBS WMTS layers (EPSG:3857, "best" endpoint). Every id, tile matrix set,
 * format and legend below was checked against the GIBS capabilities document
 * (https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml).
 * Legend stops are sampled from the official GIBS colormaps (v1.3).
 * Time = "default" resolves to the latest available date; the actual date is
 * returned in the CORS-exposed `layer-time-actual` response header.
 */

export type SatelliteLayerId = "none" | "truecolor" | "ndvi" | "precipitation" | "soilmoisture" | "lst";

export interface LegendStop {
  color: string;
  label?: string;
}

export interface SatelliteLayer {
  id: Exclude<SatelliteLayerId, "none">;
  label: string;
  shortLabel: string;
  gibsId: string;
  tileMatrixSet: string;
  maxLevel: number;
  format: "png" | "jpg";
  product: string;
  measures: string;
  unit: string;
  spatialResolution: string;
  temporalResolution: string;
  legend: LegendStop[] | null;
  legendMin?: string;
  legendMax?: string;
  colormapUrl?: string;
  caveat: string;
}

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export const BASEMAP = {
  gibsId: "BlueMarble_ShadedRelief_Bathymetry",
  url: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
  maxLevel: 8,
  credit: "NASA GIBS · Blue Marble Shaded Relief & Bathymetry",
} as const;

/**
 * High-resolution imagery for finding and outlining fields (sub-metre to ~1 m in most
 * farm regions). Public tiles with attribution; set NEXT_PUBLIC_ARCGIS_API_KEY to use
 * the keyed ArcGIS basemap service for production.
 */
const ARCGIS_KEY = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
export const HIGH_RES_IMAGERY = {
  url: ARCGIS_KEY
    ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_KEY}`
    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  maxLevel: 19,
  credit: "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  /**
   * Where Esri has no imagery at a zoom level it serves a "Map data not yet available"
   * placeholder tile instead of an error. Tiles identical to this known placeholder are
   * discarded so Cesium keeps showing the sharper parent level.
   */
  missingTileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/20/393362/724545",
  /** Show above the NASA basemap below this camera height. */
  showBelowM: 1_500_000,
} as const;

/**
 * One still image of Esri World Imagery for a Web Mercator box (MapServer `export`, CORS-enabled).
 * Used for the satellite photo in the printable field report.
 */
export function imageryExportUrl(bbox: [number, number, number, number], sizePx: number): string {
  const q = new URLSearchParams({
    bbox: bbox.map((v) => v.toFixed(1)).join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${sizePx},${sizePx}`,
    format: "jpg",
    f: "image",
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${q}`;
}

export const SATELLITE_LAYERS: SatelliteLayer[] = [
  {
    id: "truecolor",
    label: "True color",
    shortLabel: "True color",
    gibsId: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
    maxLevel: 9,
    format: "jpg",
    product: "VIIRS (Suomi NPP) Corrected Reflectance",
    measures: "Natural-color daily satellite image",
    unit: "—",
    spatialResolution: "≈250 m",
    temporalResolution: "Daily",
    legend: null,
    caveat: "Daily swaths: clouds and gaps between orbits are expected.",
  },
  {
    id: "ndvi",
    label: "Vegetation (NDVI)",
    shortLabel: "Vegetation",
    gibsId: "MODIS_Terra_NDVI_8Day",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
    maxLevel: 9,
    format: "png",
    product: "MODIS Terra NDVI, rolling 8-day",
    measures: "Greenness of vegetation",
    unit: "NDVI (unitless)",
    spatialResolution: "≈250 m",
    temporalResolution: "Rolling 8-day",
    legend: [
      { color: "#f1ecec" }, { color: "#ddc9bc" }, { color: "#b19883" }, { color: "#bfde77" },
      { color: "#78ad01" }, { color: "#3e8a01" }, { color: "#086701" }, { color: "#001801" },
    ],
    legendMin: "0.0",
    legendMax: "1.0",
    colormapUrl: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_NDVI.xml",
    caveat: "Visualization only. Cloud-affected pixels may be missing.",
  },
  {
    id: "precipitation",
    label: "Precipitation rate (IMERG)",
    shortLabel: "Rainfall",
    gibsId: "IMERG_Precipitation_Rate",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxLevel: 6,
    format: "png",
    product: "GPM IMERG precipitation rate",
    measures: "How hard it rained",
    unit: "mm/h",
    spatialResolution: "0.1° (≈10 km)",
    temporalResolution: "Daily",
    legend: [
      { color: "#00764e" }, { color: "#00a209" }, { color: "#68cb00" }, { color: "#f7d900" },
      { color: "#ff6522" }, { color: "#f30000" }, { color: "#960000" }, { color: "#330000" },
    ],
    legendMin: "0.1",
    legendMax: "≥ 53",
    colormapUrl: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GPM_Precipitation_Rate.xml",
    caveat: "Coarse grid (≈10 km) — regional pattern, not field rainfall.",
  },
  {
    id: "soilmoisture",
    label: "Root-zone soil moisture (SMAP L4)",
    shortLabel: "Soil moisture",
    gibsId: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxLevel: 6,
    format: "png",
    product: "SMAP L4 analyzed root-zone soil moisture",
    measures: "Water held in the root zone",
    unit: "cm³/cm³",
    spatialResolution: "9 km",
    temporalResolution: "Daily (12z)",
    legend: [
      { color: "#ffa200" }, { color: "#fff800" }, { color: "#47a300" }, { color: "#00ca95" },
      { color: "#009aff" }, { color: "#0000db" }, { color: "#080864" }, { color: "#505050" },
    ],
    legendMin: "0.00",
    legendMax: "≥ 0.70",
    colormapUrl: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Analyzed_Soil_Moisture.xml",
    caveat: "Regional (9 km) model-assimilated product — not a field sensor.",
  },
  {
    id: "lst",
    label: "Land surface temperature (day)",
    shortLabel: "Surface temp",
    gibsId: "MODIS_Terra_Land_Surface_Temp_Day",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
    maxLevel: 7,
    format: "png",
    product: "MODIS Terra Land Surface Temperature (day)",
    measures: "How hot the ground surface is",
    unit: "K",
    spatialResolution: "≈1 km",
    temporalResolution: "Daily",
    legend: [
      { color: "#c900ff" }, { color: "#3900ff" }, { color: "#0075ff" }, { color: "#24ffab" },
      { color: "#a4ff00" }, { color: "#ffdc00" }, { color: "#ff6d00" }, { color: "#ff0100" },
    ],
    legendMin: "< 200 K",
    legendMax: "≥ 350 K",
    colormapUrl: "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Land_Surface_Temp.xml",
    caveat: "Surface skin temperature, not air temperature. Gaps under clouds.",
  },
];

export function getSatelliteLayer(id: SatelliteLayerId): SatelliteLayer | null {
  return SATELLITE_LAYERS.find((l) => l.id === id) ?? null;
}

export function gibsTileUrl(layer: SatelliteLayer): string {
  return `${GIBS}/${layer.gibsId}/default/default/${layer.tileMatrixSet}/{z}/{y}/{x}.${layer.format}`;
}

export function gibsProbeUrl(layer: SatelliteLayer): string {
  return `${GIBS}/${layer.gibsId}/default/default/${layer.tileMatrixSet}/0/0/0.${layer.format}`;
}
