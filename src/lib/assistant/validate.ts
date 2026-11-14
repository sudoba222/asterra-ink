import type { ChatRequest, FieldContext, Irrigation, Priority } from './types';

type Result = { ok: true; value: ChatRequest } | { ok: false; error: string };

const IRRIGATION: Irrigation[] = ['rainfed', 'irrigated', 'both', 'unknown'];
const PRIORITY: Priority[] = ['profit', 'yield', 'water', 'soil', 'risk', 'unknown'];
export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2000;

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;

/** Seam for country-code differences between frontend (flags use alpha-3) and backend spec (alpha-2). */
export function normalizeCountryCode(code: string): string {
  return code.toUpperCase();
}

export function parseField(raw: unknown): { ok: true; value?: FieldContext } | { ok: false; error: string } {
  if (raw == null) return { ok: true };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'field must be an object' };
  const r = raw as Record<string, any>;
  const f: FieldContext = {};
  if (r.regionId != null) {
    if (typeof r.regionId !== 'string' || !/^[\w.-]{1,64}$/.test(r.regionId)) return { ok: false, error: 'invalid regionId' };
    f.regionId = r.regionId;
  }
  if (r.centroid != null) {
    const { latitude: la, longitude: lo } = r.centroid ?? {};
    if (typeof la !== 'number' || typeof lo !== 'number' || Math.abs(la) > 90 || Math.abs(lo) > 180)
      return { ok: false, error: 'invalid centroid' };
    f.centroid = { latitude: la, longitude: lo };
  }
  if (r.areaHectares != null) {
    if (typeof r.areaHectares !== 'number' || !(r.areaHectares >= 0) || r.areaHectares > 1e7)
      return { ok: false, error: 'invalid areaHectares' };
    f.areaHectares = r.areaHectares;
  }
  if (r.previousCrops != null) {
    if (!Array.isArray(r.previousCrops) || r.previousCrops.length > 2) return { ok: false, error: 'previousCrops must have at most 2 entries' };
    const crops = r.previousCrops.map((c: unknown) => str(c, 40));
    if (crops.some((c: string | undefined) => !c)) return { ok: false, error: 'invalid previousCrops entry' };
    f.previousCrops = crops as string[];
  }
  if (r.irrigation != null) {
    if (!IRRIGATION.includes(r.irrigation)) return { ok: false, error: 'invalid irrigation' };
    f.irrigation = r.irrigation;
  }
  if (r.priority != null) {
    if (!PRIORITY.includes(r.priority)) return { ok: false, error: 'invalid priority' };
    f.priority = r.priority;
  }
  for (const [key, max] of [['plannedPlanting', 30], ['issues', 500], ['budget', 40], ['soilType', 40]] as const) {
    if (r[key] != null) {
      const s = str(r[key], max);
      if (!s) return { ok: false, error: `invalid ${key}` };
      (f as any)[key] = s;
    }
  }
  return { ok: true, value: f };
}

export function parseChatRequest(body: unknown): Result {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, any>;
  if (typeof b.countryCode !== 'string' || !/^[A-Za-z]{2,3}$/.test(b.countryCode))
    return { ok: false, error: 'countryCode must be a 2 or 3 letter country code' };
  if (!Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > MAX_MESSAGES)
    return { ok: false, error: `messages must contain 1-${MAX_MESSAGES} items` };
  const messages = [];
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string')
      return { ok: false, error: 'each message needs a role (user|assistant) and string content' };
    const content = m.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS)
      return { ok: false, error: `message content must be 1-${MAX_MESSAGE_CHARS} characters` };
    messages.push({ role: m.role as 'user' | 'assistant', content });
  }
  if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user')
    return { ok: false, error: 'conversation must start and end with a user message' };
  const field = parseField(b.field);
  if (!field.ok) return field;
  return { ok: true, value: { countryCode: normalizeCountryCode(b.countryCode), messages, field: field.value } };
}
