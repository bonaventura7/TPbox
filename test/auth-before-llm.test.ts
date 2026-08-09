import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/news-generate/index.ts', import.meta.url), 'utf8');

describe('news-generate authorization ordering', () => {
  it('authorizes the caller before the first LLM invocation', () => {
    const authIndex = source.indexOf('await authorizeCaller(');
    // Ensure we check the runtime invocation of the generator (await generate()),
    // not the internal helper generateJson() which is defined earlier.
    const llmIndex = source.indexOf('await generate(');
    const serviceClientIndex = source.indexOf('createClient(SUPABASE_URL, SERVICE_KEY)');

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(llmIndex).toBeGreaterThanOrEqual(0);
    expect(serviceClientIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeLessThan(serviceClientIndex);
    expect(serviceClientIndex).toBeLessThan(llmIndex);
  });
});
