import type { AssistantConfig } from './config';
import { AssistantError } from './types';
import type { ToolDef } from './tools';

export interface LlmBlock { type: string; [k: string]: any }
export interface LlmMessage { role: 'user' | 'assistant'; content: string | LlmBlock[] }
export interface LlmResponse { stop_reason: string; content: LlmBlock[] }
export type LlmCall = (args: { system: string; messages: LlmMessage[]; tools: ToolDef[] }) => Promise<LlmResponse>;

export function createAnthropicCall(cfg: Pick<AssistantConfig, 'anthropicApiKey' | 'model' | 'llmTimeoutMs'>, fetchImpl: typeof fetch = fetch): LlmCall {
  return async ({ system, messages, tools }) => {
    if (!cfg.anthropicApiKey) throw new AssistantError('LLM_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set', 503);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.llmTimeoutMs);
    try {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 1200, system, messages, tools }),
      });
      if (!res.ok) throw new AssistantError(res.status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_UNAVAILABLE', `LLM request failed (${res.status})`, res.status === 429 ? 429 : 503);
      return (await res.json()) as LlmResponse;
    } catch (e: any) {
      if (e instanceof AssistantError) throw e;
      if (e?.name === 'AbortError') throw new AssistantError('LLM_TIMEOUT', 'The language model did not respond in time', 504);
      throw new AssistantError('LLM_UNAVAILABLE', 'The language model could not be reached', 503);
    } finally {
      clearTimeout(timer);
    }
  };
}
