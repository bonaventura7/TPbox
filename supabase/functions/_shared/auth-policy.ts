export type AuthDecision = { ok: true; status: 200 } | { ok: false; status: 401 | 403; error: 'missing_authorization' | 'invalid_identity' | 'forbidden' };

export function decideIdentity(userId: string | null | undefined, expectedCallerId: string): AuthDecision {
  if (!userId) return { ok: false, status: 401, error: 'invalid_identity' };
  if (!expectedCallerId || userId !== expectedCallerId) return { ok: false, status: 403, error: 'forbidden' };
  return { ok: true, status: 200 };
}