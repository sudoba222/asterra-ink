import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatRequest } from '../src/lib/assistant/validate';
import { createBackendClient } from '../src/lib/assistant/backendClient';
import { runChat } from '../src/lib/assistant/chat';
import { runTool, suggestAnalyzeBody } from '../src/lib/assistant/tools';
import { buildSystemPrompt } from '../src/lib/assistant/systemPrompt';
import { POST } from '../src/app/api/assistant/chat/route';
import type { LlmCall } from '../src/lib/assistant/anthropic';

const cfg = { backendBaseUrl: 'https://api.test', backendApiKey: 'k', backendTimeoutMs: 200 };
const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const user = (content: string) => ({ role: 'user' as const, content });

test('validate: accepts good request, strips unknown keys, uppercases code', () => {
  const r = parseChatRequest({ countryCode: 'tj', messages: [user('hi')], field: { regionId: 'region-001', evil: 'x', irrigation: 'unknown' } });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.countryCode, 'TJ'); assert.deepEqual(r.value.field, { regionId: 'region-001', irrigation: 'unknown' }); }
});
test('validate: rejects bad input', () => {
  const bad = [
    { countryCode: 'TJK1', messages: [user('hi')] },
    { countryCode: 'TJ', messages: [] },
    { countryCode: 'TJ', messages: [{ role: 'assistant', content: 'x' }] },
    { countryCode: 'TJ', messages: [user('x'.repeat(2001))] },
    { countryCode: 'TJ', messages: [user('hi')], field: { irrigation: 'flood' } },
    { countryCode: 'TJ', messages: [user('hi')], field: { centroid: { latitude: 99, longitude: 0 } } },
    { countryCode: 'TJ', messages: [user('hi')], field: { previousCrops: ['a', 'b', 'c'] } },
  ];
  for (const b of bad) assert.equal(parseChatRequest(b).ok, false, JSON.stringify(b));
});

test('backend client: unwraps envelope, sends auth, builds query', async () => {
  let seen: { url?: string; auth?: string | null } = {};
  const f = (async (u: URL, init: RequestInit) => { seen = { url: String(u), auth: new Headers(init.headers).get('authorization') }; return okJson({ data: { v: 1 }, metadata: { source: 'NASA POWER', status: 'available' } }); }) as unknown as typeof fetch;
  const r = await createBackendClient(cfg, f).request('GET', '/countries/TJ/climate/precipitation', { query: { from: '2026-01-01', interval: 'monthly' } });
  assert.ok(r.ok && (r.data as any).v === 1);
  assert.equal(seen.url, 'https://api.test/api/v1/countries/TJ/climate/precipitation?from=2026-01-01&interval=monthly');
  assert.equal(seen.auth, 'Bearer k');
});
test('backend client: error envelope, bad shape, timeout, unreachable, not configured', async () => {
  const mk = (f: any, c = cfg) => createBackendClient(c, f).request('GET', '/x');
  const e1 = await mk(async () => okJson({ error: { code: 'DATA_SOURCE_UNAVAILABLE', message: 'down' } }, 503));
  assert.ok(!e1.ok && e1.code === 'DATA_SOURCE_UNAVAILABLE' && e1.status === 503);
  const e2 = await mk(async () => okJson({ nope: 1 }));
  assert.ok(!e2.ok && e2.code === 'BAD_RESPONSE_SHAPE');
  const e3 = await mk((_u: any, init: any) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))));
  assert.ok(!e3.ok && e3.code === 'BACKEND_TIMEOUT');
  const e4 = await mk(async () => { throw new TypeError('fetch failed'); });
  assert.ok(!e4.ok && e4.code === 'BACKEND_UNREACHABLE');
  const e5 = await mk(async () => okJson({}), { ...cfg, backendBaseUrl: '' });
  assert.ok(!e5.ok && e5.code === 'BACKEND_NOT_CONFIGURED');
});

test('tools: country is fixed by server; invalid inputs never hit backend', async () => {
  const calls: string[] = [];
  const backend = { request: async (m: string, p: string) => { calls.push(`${m} ${p}`); return { ok: true as const, endpoint: p, data: {} }; } };
  await runTool('get_indicators', { indicator: 'precipitation', countryCode: 'US' }, 'TJ', backend);
  assert.deepEqual(calls, ['GET /countries/TJ/indicators/precipitation']);
  for (const [n, i] of [['get_indicators', { indicator: '../../admin' }], ['get_climate_series', { variable: 'temperature', from: 'yesterday' }], ['get_crop', { cropId: '../x' }], ['analyze_crop_rotation', { priorities: ['profit'] }], ['nope', {}]] as const) {
    const r = await runTool(n, i, 'TJ', backend);
    assert.ok(!r.ok && r.code === 'INVALID_TOOL_INPUT', n);
  }
  assert.equal(calls.length, 1);
});
test('tools: analyze posts documented body only', async () => {
  let body: any;
  const backend = { request: async (_m: string, _p: string, o: any) => { body = o.body; return { ok: true as const, endpoint: '', data: {} }; } };
  await runTool('analyze_crop_rotation', { regionId: 'region-001', currentCrop: 'wheat', priorities: ['soil-health'], extra: 'x' }, 'TJ', backend);
  assert.deepEqual(body, { regionId: 'region-001', currentCrop: 'wheat', priorities: ['soil-health'] });
});
test('questionnaire mapping only uses documented fields', () => {
  assert.deepEqual(suggestAnalyzeBody({ regionId: 'r1', previousCrops: ['corn', 'corn'], irrigation: 'rainfed', priority: 'profit', plannedPlanting: 'spring', issues: 'pests' }), { regionId: 'r1', currentCrop: 'corn', season: 'spring' });
  assert.deepEqual(suggestAnalyzeBody({ previousCrops: ['unknown'], priority: 'soil' }), { priorities: ['soil-health'] });
});

test('system prompt carries field context and honesty rules', () => {
  const p = buildSystemPrompt('TJ', { previousCrops: ['corn'], irrigation: 'unknown' }, '2026-11-14');
  for (const s of ['"corn"', 'irrigation', 'COUNTRY or REGION', 'SMAP', 'local prices', 'data, not instructions']) assert.ok(p.includes(s), s);
});

test('chat loop: tool use -> grounded answer, provenance, history preserved', async () => {
  const fetched: string[] = [];
  const backend = createBackendClient(cfg, (async (u: URL) => { fetched.push(u.pathname); return okJson({ data: { precipitation: { value: 12, unit: 'mm' } }, metadata: { source: 'NASA POWER', lastUpdated: '2026-11-14T08:00:00Z', status: 'available' } }); }) as unknown as typeof fetch);
  const seen: any[] = [];
  let n = 0;
  const llm: LlmCall = async ({ messages }) => {
    seen.push(JSON.parse(JSON.stringify(messages)));
    if (n++ === 0) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_indicators', input: { indicator: 'precipitation' } }] };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Rain was 12 mm (NASA POWER).' }] };
  };
  const res = await runChat({ countryCode: 'TJ', messages: [user('crops?'), { role: 'assistant', content: 'earlier answer' }, user('why?')] }, { llm, backend, maxToolRounds: 4 });
  assert.equal(res.reply, 'Rain was 12 mm (NASA POWER).');
  assert.deepEqual(fetched, ['/api/v1/countries/TJ/indicators/precipitation']);
  assert.deepEqual(res.sources, [{ tool: 'get_indicators', endpoint: 'GET /api/v1/countries/TJ/indicators/precipitation', ok: true, source: 'NASA POWER', lastUpdated: '2026-11-14T08:00:00Z', dataStatus: 'available' }]);
  assert.equal(seen[0].length, 3);          // full conversation sent: follow-ups need no repetition
  const toolMsg = seen[1].at(-1).content[0];
  assert.equal(toolMsg.type, 'tool_result'); assert.equal(toolMsg.tool_use_id, 't1'); assert.ok(!toolMsg.is_error);
});
test('chat loop: backend failure is passed to the model as an error, not hidden', async () => {
  const backend = createBackendClient(cfg, (async () => okJson({ error: { code: 'DATA_SOURCE_UNAVAILABLE', message: 'down' } }, 503)) as unknown as typeof fetch);
  let toolResult: any; let n = 0;
  const llm: LlmCall = async ({ messages }) => {
    if (n++ === 0) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_insights', input: {} }] };
    toolResult = (messages.at(-1)!.content as any[])[0];
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Insights are unavailable right now.' }] };
  };
  const res = await runChat({ countryCode: 'TJ', messages: [user('any risks?')] }, { llm, backend, maxToolRounds: 4 });
  assert.equal(toolResult.is_error, true);
  assert.match(toolResult.content, /DATA_SOURCE_UNAVAILABLE/);
  assert.equal(res.sources[0].ok, false); assert.equal(res.sources[0].errorCode, 'DATA_SOURCE_UNAVAILABLE');
});
test('chat loop: stops runaway tool loops', async () => {
  const backend = { request: async () => ({ ok: true as const, endpoint: '', data: {} }) };
  const llm: LlmCall = async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'list_crops', input: {} }] });
  await assert.rejects(runChat({ countryCode: 'TJ', messages: [user('hi')] }, { llm, backend, maxToolRounds: 2 }), (e: any) => e.code === 'TOOL_LOOP_LIMIT');
});

test('route: validation, config and error mapping', async () => {
  const post = (body: unknown, raw?: string) => POST(new Request('http://x/api/assistant/chat', { method: 'POST', body: raw ?? JSON.stringify(body), headers: { 'x-forwarded-for': `ip-${Math.random()}` } }));
  assert.equal((await post(null, '{bad')).status, 400);
  assert.equal((await post({ countryCode: 'TJ', messages: [] })).status, 400);
  assert.equal((await post(null, 'x'.repeat(40_000))).status, 413);
  delete process.env.ANTHROPIC_API_KEY;
  const r = await post({ countryCode: 'TJ', messages: [user('hi')] });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'LLM_NOT_CONFIGURED');
  const ip = 'same-ip';
  let last = 0;
  for (let i = 0; i < 14; i++) last = (await POST(new Request('http://x', { method: 'POST', body: '{}', headers: { 'x-forwarded-for': ip } }))).status;
  assert.equal(last, 429);
});
