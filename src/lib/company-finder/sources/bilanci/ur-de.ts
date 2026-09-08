import type { Financials } from "../../types";
import { fetchOpenRegisterFinancials } from "./openregister-de";
import { fetchGermanyPublicBalance } from "./germany-public-balance";

export interface UrResult {
  ok: boolean;
  data?: Financials;
  error?: string;
  skipped?: string;
}

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

/**
 * Germany financials provider chain.
 * 1. OpenRegister: official-source structured balance sheet / P&L.
 * 2. Public indexed balance page: server-side extraction of publicly visible
 *    balance data, used when the official portal/API path is unavailable.
 *
 * No CAPTCHA/WAF is bypassed and no secret is stored in source control.
 */
export async function searchUrAccounting(companyName: string, timeoutMs = 30000): Promise<UrResult> {
  const query = companyName.trim();
  if (query.length < 3) return { ok: false, error: "ragione sociale troppo corta" };

  const key = env().OPENREGISTER_API_KEY?.trim();
  if (key) {
    const structured = await fetchOpenRegisterFinancials(query, key, Math.min(timeoutMs, 15000));
    if (structured.ok && structured.data) return structured;
  }

  const publicBalance = await fetchGermanyPublicBalance(query);
  if (publicBalance.ok && publicBalance.data) return publicBalance;

  return {
    ok: false,
    error: [
      key ? "OpenRegister non ha restituito il bilancio" : "OPENREGISTER_API_KEY non configurata",
      publicBalance.error ?? "fallback pubblico non disponibile",
    ].join("; "),
  };
}
