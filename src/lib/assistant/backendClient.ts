import type { AssistantConfig } from './config';

export type BackendResult =
  | { ok: true; endpoint: string; data: unknown; metadata?: Record<string, any> }
  | { ok: false; endpoint: string; code: string; message: string; status?: number };

type FetchLike = typeof fetch;

export interface BackendClient {
  request(method: 'GET' | 'POST', path: string, opts?: { query?: Record<string, string | undefined>; body?: unknown }): Promise<BackendResult>;
}

/**
 * Thin client for the documented ASTERRA envelope:
 *   success: { data, metadata }   error: { error: { code, message } }
 * Runs server-side only; the API key never reaches the browser.
 */
export function createBackendClient(cfg: Pick<AssistantConfig, 'backendBaseUrl' | 'backendApiKey' | 'backendTimeoutMs'>, fetchImpl: FetchLike = fetch): BackendClient {
  return {
    async request(method, path, opts = {}) {
      const endpoint = `${method} /api/v1${path}`;
      if (!cfg.backendBaseUrl) {
        return { ok: false, endpoint, code: 'BACKEND_NOT_CONFIGURED', message: 'ASTERRA_API_BASE_URL is not set' };
      }
      const url = new URL(`${cfg.backendBaseUrl}/api/v1${path}`);
      for (const [k, v] of Object.entries(opts.query ?? {})) if (v) url.searchParams.set(k, v);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.backendTimeoutMs);
      try {
        const res = await fetchImpl(url, {
          method,
          signal: ctrl.signal,
          headers: {
            Accept: 'application/json',
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
            ...(cfg.backendApiKey ? { Authorization: `Bearer ${cfg.backendApiKey}` } : {}),
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        let json: any = null;
        try { json = await res.json(); } catch { /* non-JSON body */ }
        if (!res.ok) {
          return {
            ok: false, endpoint, status: res.status,
            code: json?.error?.code ?? `HTTP_${res.status}`,
            message: json?.error?.message ?? res.statusText ?? 'Request failed',
          };
        }
        if (json == null || typeof json !== 'object' || !('data' in json)) {
          return { ok: false, endpoint, status: res.status, code: 'BAD_RESPONSE_SHAPE', message: 'Response did not match the documented { data, metadata } envelope' };
        }
        return { ok: true, endpoint, data: json.data, metadata: json.metadata };
      } catch (e: any) {
        const timedOut = e?.name === 'AbortError';
        return { ok: false, endpoint, code: timedOut ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE', message: timedOut ? 'The backend did not respond in time' : 'The backend could not be reached' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
