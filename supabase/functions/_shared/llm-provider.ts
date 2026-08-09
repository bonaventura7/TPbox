export const DEFAULT_LLM_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export const DEFAULT_LLM_FALLBACK = 'openai/gpt-4o-mini';
export const DEFAULT_LLM_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_LLM_TIMEOUT_MS = 60000;
export const DEFAULT_LLM_MAX_RETRIES = 1;

export type LlmEnv = Record<string, string | undefined>;
export type LlmMessage = { role: 'system' | 'user'; content: string };
export type FetchLike = typeof fetch;

export type LlmConfig = {
  apiKey: string;
  model: string;
  fallbackModel: string;
  endpoint: string;
  timeoutMs: number;
  maxRetries: number;
};

export function getLlmConfig(env: LlmEnv): LlmConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  return {
    apiKey,
    model: env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
    fallbackModel: env.LLM_MODEL_FALLBACK?.trim() || DEFAULT_LLM_FALLBACK,
    endpoint: env.LLM_ENDPOINT?.trim() || DEFAULT_LLM_ENDPOINT,
    timeoutMs: Number(env.LLM_TIMEOUT_MS || DEFAULT_LLM_TIMEOUT_MS),
    maxRetries: Math.max(0, Number(env.LLM_MAX_RETRIES || DEFAULT_LLM_MAX_RETRIES)),
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function requestModel(
  model: string,
  messages: LlmMessage[],
  config: LlmConfig,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        'http-referer': 'https://transfer-guide-italia.lovable.app',
        'x-title': 'TransferGuideItalia-Editor',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (isRetryableStatus(response.status)) {
        throw new Error(`retryable LLM HTTP ${response.status}`);
      }
      throw new Error(`LLM HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('LLM returned empty content');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(
  model: string,
  messages: LlmMessage[],
  config: LlmConfig,
  fetchImpl: FetchLike,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await requestModel(model, messages, config, fetchImpl);
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxRetries) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('LLM request failed');
}

export async function generateJson(
  messages: LlmMessage[],
  env: LlmEnv,
  fetchImpl: FetchLike = fetch,
): Promise<{ value: unknown; model: string }> {
  const config = getLlmConfig(env);

  try {
    return { value: await withRetry(config.model, messages, config, fetchImpl), model: config.model };
  } catch (primaryError) {
    if (config.fallbackModel === config.model) throw primaryError;
    return { value: await requestModel(config.fallbackModel, messages, config, fetchImpl), model: config.fallbackModel };
  }
}
