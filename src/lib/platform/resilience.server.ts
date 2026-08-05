/**
 * Utilità di piattaforma lato server: correlation ID, timeout, retry idempotente,
 * circuit breaker e audit trail. Nessun segreto, nessuna chiamata esterna.
 */

export function newCorrelationId(): string {
  return `cid-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export interface AuditEntry {
  correlationId: string;
  action: string;
  actorRole: string;
  at: string;
  outcome: "OK" | "DENIED" | "ERROR";
  detail?: string;
}

const auditTrail: AuditEntry[] = [];

export function audit(entry: AuditEntry): void {
  auditTrail.push(entry);
  if (auditTrail.length > 500) auditTrail.shift();
}

export function readAuditTrail(): readonly AuditEntry[] {
  return auditTrail;
}

export async function withTimeout<T>(
  op: (signal: AbortSignal) => Promise<T>,
  ms = 4000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await op(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Retry idempotente con backoff lineare. Da usare solo per operazioni di sola lettura. */
export async function retryIdempotent<T>(
  op: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 120,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: BreakerState = "CLOSED";

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  get current(): BreakerState {
    if (this.state === "OPEN" && Date.now() - this.openedAt > this.cooldownMs) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  canPass(): boolean {
    return this.current !== "OPEN";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }
}