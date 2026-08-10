import { describe, expect, it } from 'vitest';
import { authorizeCaller } from '../supabase/functions/_shared/auth.ts';

function clientFor(userId: string | null, error: unknown = null) {
  return {
    auth: {
      getUser: async (_token: string) => ({ data: { user: userId ? { id: userId } : null }, error }),
    },
  };
}

describe('authorization gate', () => {
  it('returns 401 when Authorization is missing', async () => {
    const result = await authorizeCaller(new Request('https://example.test'), clientFor('allowed'), 'allowed', 'test');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const result = await authorizeCaller(
      new Request('https://example.test', { headers: { Authorization: 'Bearer invalid' } }),
      clientFor(null, new Error('invalid token')),
      'allowed',
      'test',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('returns 403 when the authenticated sub is not allowlisted', async () => {
    const result = await authorizeCaller(
      new Request('https://example.test', { headers: { Authorization: 'Bearer valid' } }),
      clientFor('other-user'),
      'allowed',
      'test',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('allows only the configured caller sub', async () => {
    const result = await authorizeCaller(
      new Request('https://example.test', { headers: { Authorization: 'Bearer valid', 'X-Correlation-ID': 'auth-test-1' } }),
      clientFor('allowed'),
      'allowed',
      'test',
    );
    expect(result).toMatchObject({ ok: true, userId: 'allowed', correlationId: 'auth-test-1' });
  });
});
