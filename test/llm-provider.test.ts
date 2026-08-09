import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LLM_FALLBACK,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_ENDPOINT,
  generateJson,
  getLlmConfig,
} from '../supabase/functions/_shared/llm-provider.ts';
import { redactSecret } from '../supabase/functions/_shared/redact.ts';

describe('OpenRouter LLM provider', () => {
  it('uses the OpenRouter defaults', () => {
    const config = getLlmConfig({ OPENROUTER_API_KEY: 'test-key' });
    expect(config.model).toBe(DEFAULT_LLM_MODEL);
    expect(config.fallbackModel).toBe(DEFAULT_LLM_FALLBACK);
    expect(config.endpoint).toBe(DEFAULT_LLM_ENDPOINT);
  });

  it('allows the model and endpoint to be configured', () => {
    const config = getLlmConfig({
      OPENROUTER_API_KEY: 'test-key',
      LLM_MODEL: 'custom/model',
      LLM_ENDPOINT: 'https://example.test/chat',
    });
    expect(config.model).toBe('custom/model');
    expect(config.endpoint).toBe('https://example.test/chat');
  });

  it('calls OpenRouter with the configured model and parses JSON', async () => {
    const calls: Request[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"ok"}' } }] }), { status: 200 });
    };

    const result = await generateJson(
      [
        { role: 'system', content: 'return json' },
        { role: 'user', content: 'source' },
      ],
      { OPENROUTER_API_KEY: 'test-key' },
      fakeFetch,
    );

    expect(result.value).toEqual({ title: 'ok' });
    expect(result.model).toBe(DEFAULT_LLM_MODEL);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DEFAULT_LLM_ENDPOINT);
    expect(await calls[0].json()).toMatchObject({
      model: DEFAULT_LLM_MODEL,
      response_format: { type: 'json_object' },
    });
  });

  it('falls back only after the configured primary retry is exhausted', async () => {
    const models: string[] = [];
    let attempts = 0;
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      attempts++;
      if (attempts <= 2) return new Response('busy', { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"fallback"}' } }] }), { status: 200 });
    };

    const result = await generateJson(
      [{ role: 'user', content: 'source' }],
      { OPENROUTER_API_KEY: 'test-key', LLM_MAX_RETRIES: '1' },
      fakeFetch,
    );

    expect(result.value).toEqual({ title: 'fallback' });
    expect(models).toEqual([DEFAULT_LLM_MODEL, DEFAULT_LLM_MODEL, DEFAULT_LLM_FALLBACK]);
  });

  it('redacts bearer and API secrets', () => {
    const redacted = redactSecret('Authorization: Bearer abc123 openrouter_api_key=sk-or-v1-secret api_key=sk-long-secret-value');
    expect(redacted).not.toContain('abc123');
    expect(redacted).not.toContain('sk-or-v1-secret');
    expect(redacted).toContain('[REDACTED]');
  });
});
