import type { BackendClient, BackendResult } from './backendClient';
import type { FieldContext } from './types';

/**
 * Whitelisted, read-mostly tools. Every tool maps to an endpoint documented in
 * ASTERRA_Backend_API_Requirements (v1). The country always comes from the request,
 * never from model output, so the model cannot query other countries.
 */
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }

const VARIABLES = ['temperature', 'precipitation', 'soil-moisture', 'vegetation', 'evapotranspiration', 'water-availability'];
const CLIMATE = ['temperature', 'precipitation', 'soil-moisture', 'vegetation', 'summary'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w.-]{1,64}$/;
export const ALLOWED_PRIORITIES = ['water-efficiency', 'soil-health']; // only values shown in the API doc example

export const TOOL_DEFS: ToolDef[] = [
  { name: 'get_country_dashboard', description: 'Aggregated country dashboard (overview, indicators, climate summary, insights, risk, impact) with per-section status. Good first call.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_indicators', description: 'Current environmental indicators for the selected country, optionally a single one.', input_schema: { type: 'object', properties: { indicator: { type: 'string', enum: VARIABLES } } } },
  { name: 'get_climate_series', description: 'Historical time series (or trend summary) for the selected country.', input_schema: { type: 'object', properties: { variable: { type: 'string', enum: CLIMATE }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' }, interval: { type: 'string', enum: ['daily', 'weekly', 'monthly'] } }, required: ['variable'] } },
  { name: 'get_insights', description: 'Agricultural insights for the selected country, with evidence and severity.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_risk_assessment', description: 'Supported environmental risk indicators for the selected country.', input_schema: { type: 'object', properties: {} } },
  { name: 'list_crops', description: 'Crops supported by the system for the selected country.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_crop', description: 'Requirements and information for one crop (use an id from list_crops).', input_schema: { type: 'object', properties: { cropId: { type: 'string' } }, required: ['cropId'] } },
  { name: 'get_existing_crop_recommendations', description: 'Existing crop recommendations for the selected country, if the backend has any.', input_schema: { type: 'object', properties: {} } },
  { name: 'analyze_crop_rotation', description: 'Ask the backend rule engine for crop recommendations. Only pass values the farmer actually stated or that are in the field context; omit anything unknown. The backend ranks; you only explain.', input_schema: { type: 'object', properties: { regionId: { type: 'string' }, currentCrop: { type: 'string' }, soilType: { type: 'string' }, season: { type: 'string' }, priorities: { type: 'array', items: { type: 'string', enum: ALLOWED_PRIORITIES } } } } },
  { name: 'get_data_source_status', description: 'Health/freshness of the data providers behind ASTERRA. Use to explain missing or stale data.', input_schema: { type: 'object', properties: {} } },
];

const bad = (endpoint: string, message: string): BackendResult => ({ ok: false, endpoint, code: 'INVALID_TOOL_INPUT', message });

export async function runTool(name: string, input: any, countryCode: string, backend: BackendClient): Promise<BackendResult & { tool: string }> {
  const c = encodeURIComponent(countryCode);
  const base = `/countries/${c}`;
  const i = input && typeof input === 'object' ? input : {};
  const wrap = async (p: Promise<BackendResult>) => ({ ...(await p), tool: name });
  const reject = (m: string) => ({ ...bad(name, m), tool: name });

  switch (name) {
    case 'get_country_dashboard': return wrap(backend.request('GET', `${base}/dashboard`));
    case 'get_indicators':
      if (i.indicator != null && !VARIABLES.includes(i.indicator)) return reject('unknown indicator');
      return wrap(backend.request('GET', i.indicator ? `${base}/indicators/${i.indicator}` : `${base}/indicators`));
    case 'get_climate_series': {
      if (!CLIMATE.includes(i.variable)) return reject('unknown climate variable');
      for (const k of ['from', 'to']) if (i[k] != null && !ISO_DATE.test(i[k])) return reject(`${k} must be YYYY-MM-DD`);
      if (i.interval != null && !['daily', 'weekly', 'monthly'].includes(i.interval)) return reject('invalid interval');
      return wrap(backend.request('GET', `${base}/climate/${i.variable}`, { query: { from: i.from, to: i.to, interval: i.interval } }));
    }
    case 'get_insights': return wrap(backend.request('GET', `${base}/insights`));
    case 'get_risk_assessment': return wrap(backend.request('GET', `${base}/risk-assessment`));
    case 'list_crops': return wrap(backend.request('GET', `${base}/crops`));
    case 'get_crop':
      if (typeof i.cropId !== 'string' || !ID.test(i.cropId)) return reject('invalid cropId');
      return wrap(backend.request('GET', `${base}/crops/${encodeURIComponent(i.cropId)}`));
    case 'get_existing_crop_recommendations': return wrap(backend.request('GET', `${base}/crop-recommendations`));
    case 'analyze_crop_rotation': {
      const body: Record<string, unknown> = {};
      for (const k of ['regionId', 'currentCrop', 'soilType', 'season'] as const) {
        if (i[k] != null) {
          if (typeof i[k] !== 'string' || !i[k].trim() || i[k].length > 64) return reject(`invalid ${k}`);
          body[k] = i[k].trim();
        }
      }
      if (i.priorities != null) {
        if (!Array.isArray(i.priorities) || i.priorities.some((p: unknown) => !ALLOWED_PRIORITIES.includes(p as string))) return reject('unsupported priority value');
        body.priorities = i.priorities;
      }
      return wrap(backend.request('POST', `${base}/crop-recommendations/analyze`, { body }));
    }
    case 'get_data_source_status': return wrap(backend.request('GET', '/data-sources/status'));
    default: return reject(`unknown tool ${name}`);
  }
}

/** Questionnaire -> documented analyze body. Only fields the API doc defines; nothing invented. */
export function suggestAnalyzeBody(f?: FieldContext): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!f) return body;
  if (f.regionId) body.regionId = f.regionId;
  if (f.previousCrops?.[0] && f.previousCrops[0].toLowerCase() !== 'unknown') body.currentCrop = f.previousCrops[0];
  if (f.soilType) body.soilType = f.soilType;
  if (f.plannedPlanting) body.season = f.plannedPlanting;
  if (f.priority === 'water') body.priorities = ['water-efficiency'];
  if (f.priority === 'soil') body.priorities = ['soil-health'];
  return body;
}
