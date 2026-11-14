import { loadConfig } from '../../../../lib/assistant/config';
import { createBackendClient } from '../../../../lib/assistant/backendClient';
import { createAnthropicCall } from '../../../../lib/assistant/anthropic';
import { runChat } from '../../../../lib/assistant/chat';
import { parseChatRequest } from '../../../../lib/assistant/validate';
import { AssistantError } from '../../../../lib/assistant/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Best-effort limiter (per server instance). Use a shared store (Redis/Upstash) for real enforcement on serverless.
const hits = new Map<string, number[]>();
function limited(ip: string, max = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (limited(ip)) return json(429, { error: { code: 'RATE_LIMITED', message: 'Too many questions. Please wait a minute.' } });

  const raw = await request.text();
  if (raw.length > 32_000) return json(413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request is too large' } });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json(400, { error: { code: 'INVALID_JSON', message: 'Body must be valid JSON' } }); }

  const parsed = parseChatRequest(body);
  if (!parsed.ok) return json(400, { error: { code: 'INVALID_REQUEST', message: parsed.error } });

  const cfg = loadConfig();
  try {
    const result = await runChat(parsed.value, {
      llm: createAnthropicCall(cfg),
      backend: createBackendClient(cfg),
      maxToolRounds: cfg.maxToolRounds,
    });
    return json(200, { data: result });
  } catch (e) {
    if (e instanceof AssistantError) return json(e.httpStatus, { error: { code: e.code, message: e.message } });
    console.error('assistant: unexpected error', e);
    return json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  }
}
