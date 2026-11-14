export interface AssistantConfig {
  backendBaseUrl: string; // e.g. https://api.example.com  (the /api/v1 prefix is added by the client)
  backendApiKey?: string;
  anthropicApiKey: string;
  model: string;
  backendTimeoutMs: number;
  llmTimeoutMs: number;
  maxToolRounds: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AssistantConfig {
  return {
    backendBaseUrl: (env.ASTERRA_API_BASE_URL ?? '').replace(/\/+$/, ''),
    backendApiKey: env.ASTERRA_API_KEY || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    model: env.ASSISTANT_MODEL || 'claude-sonnet-5-5',
    backendTimeoutMs: Number(env.ASSISTANT_BACKEND_TIMEOUT_MS) || 8000,
    llmTimeoutMs: Number(env.ASSISTANT_LLM_TIMEOUT_MS) || 45000,
    maxToolRounds: Number(env.ASSISTANT_MAX_TOOL_ROUNDS) || 4,
  };
}
