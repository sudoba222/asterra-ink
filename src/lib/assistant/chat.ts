import type { BackendClient } from './backendClient';
import type { LlmCall, LlmMessage } from './anthropic';
import { runTool, TOOL_DEFS } from './tools';
import { buildSystemPrompt } from './systemPrompt';
import { AssistantError } from './types';
import type { ChatRequest, ChatResult, SourceTrace } from './types';

const MAX_TOOL_CHARS = 8000;

function toToolContent(r: Awaited<ReturnType<typeof runTool>>): { text: string; isError: boolean } {
  if (!r.ok) return { isError: true, text: JSON.stringify({ status: 'error', code: r.code, message: r.message }) };
  let text = JSON.stringify({ status: 'ok', data: r.data, metadata: r.metadata });
  if (text.length > MAX_TOOL_CHARS) text = text.slice(0, MAX_TOOL_CHARS) + '…[truncated]';
  return { isError: false, text };
}

export async function runChat(req: ChatRequest, deps: { llm: LlmCall; backend: BackendClient; maxToolRounds: number }): Promise<ChatResult> {
  const system = buildSystemPrompt(req.countryCode, req.field);
  const messages: LlmMessage[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  const sources: SourceTrace[] = [];

  for (let round = 0; round <= deps.maxToolRounds; round++) {
    const resp = await deps.llm({ system, messages, tools: TOOL_DEFS });
    const toolUses = resp.content.filter((b) => b.type === 'tool_use');

    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const reply = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!reply) throw new AssistantError('EMPTY_REPLY', 'The assistant returned no answer', 502);
      return { reply, sources };
    }
    if (round === deps.maxToolRounds) break;

    messages.push({ role: 'assistant', content: resp.content });
    const results = await Promise.all(toolUses.map((u) => runTool(u.name, u.input, req.countryCode, deps.backend)));
    messages.push({
      role: 'user',
      content: results.map((r, idx) => {
        const { text, isError } = toToolContent(r);
        sources.push({
          tool: r.tool, endpoint: r.endpoint, ok: r.ok,
          ...(r.ok ? { source: r.metadata?.source, lastUpdated: r.metadata?.lastUpdated, dataStatus: r.metadata?.status } : { errorCode: r.code }),
        });
        return { type: 'tool_result', tool_use_id: toolUses[idx].id, content: text, ...(isError ? { is_error: true } : {}) };
      }),
    });
  }
  throw new AssistantError('TOOL_LOOP_LIMIT', 'The assistant needed too many data lookups; please ask a narrower question', 502);
}
