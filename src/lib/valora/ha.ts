/**
 * Utilità di resilienza per i futuri workflow Valora.
 * In questa fase sono contratti isolati: nessuna chiamata esterna reale.
 */

export interface HaPolicy {
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly jitterMs: number;
  readonly breakerThreshold: number;
  readonly bulkheadMaxConcurrent: number;
}

export const VALORA_HA_POLICY: HaPolicy = {
  timeoutMs: 4_000,
  maxAttempts: 3,
  baseDelayMs: 250,
  jitterMs: 120,
  breakerThreshold: 3,
  bulkheadMaxConcurrent: 2,
};

export function newCorrelationId(): string {
  return `valora-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Ritardo del tentativo n (0-based): backoff esponenziale con jitter deterministico in test. */
export function backoffDelayMs(attempt: number, policy: HaPolicy = VALORA_HA_POLICY, jitter = 0): number {
  const exponential = policy.baseDelayMs * 2 ** attempt;
  return exponential + Math.round(jitter * policy.jitterMs);
}

export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogEntry {
  readonly level: LogLevel;
  readonly event: string;
  readonly correlationId: string;
  readonly at: string;
  /** Solo campi non sensibili: nessun payload grezzo, nessuna credenziale. */
  readonly fields: Readonly<Record<string, string | number | boolean>>;
}

export function logEntry(
  level: LogLevel,
  event: string,
  correlationId: string,
  fields: Readonly<Record<string, string | number | boolean>> = {},
): StructuredLogEntry {
  return { level, event, correlationId, at: new Date().toISOString(), fields };
}

export interface DeadLetterEntry {
  readonly correlationId: string;
  readonly operation: string;
  readonly reason: string;
  readonly attempts: number;
  readonly at: string;
}

/** Chiave di idempotenza stabile: stessa operazione + stesso input → stessa chiave. */
export function idempotencyKey(operation: string, input: string): string {
  let hash = 2_166_136_261;
  const material = `${operation}:${input}`;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${operation}-${(hash >>> 0).toString(16)}`;
}
