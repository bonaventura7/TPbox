import { decideIdentity } from './auth-policy.ts';

export type AuthClient = {
  auth: {
    getUser: (accessToken: string) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

export type AuthResult =
  | { ok: true; userId: string; correlationId: string }
  | { ok: false; response: Response };

export function correlationId(req: Request): string {
  const supplied = req.headers.get('x-correlation-id');
  if (!supplied) return crypto.randomUUID();
  return supplied.slice(0, 128).replace(/[^\x20-\x7E]/g, '');
}

export function jsonResponse(body: unknown, status = 200, correlationId?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (correlationId) headers.set('x-correlation-id', correlationId);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function authorizeCaller(
  req: Request,
  authClient: AuthClient,
  expectedCallerId: string | null | undefined,
  serviceName: string,
): Promise<AuthResult> {
  const cid = correlationId(req);
  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'missing_authorization' }, 401, cid) };
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  if (!accessToken) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'missing_authorization' }, 401, cid) };
  }

  if (!expectedCallerId) {
    console.error(JSON.stringify({ event: `${serviceName}.auth_config_error`, correlation_id: cid }));
    return { ok: false, response: jsonResponse({ ok: false, error: 'authorization_not_configured' }, 500, cid) };
  }

  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !user) {
    console.warn(JSON.stringify({ event: `${serviceName}.auth_failed`, correlation_id: cid }));
    return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_identity' }, 401, cid) };
  }

  const decision = decideIdentity(user.id, expectedCallerId);
  if (!decision.ok) {
    console.warn(JSON.stringify({ event: `${serviceName}.auth_forbidden`, correlation_id: cid, user_id: user.id }));
    return { ok: false, response: jsonResponse({ ok: false, error: decision.error }, decision.status, cid) };
  }

  return { ok: true, userId: user.id, correlationId: cid };
}
