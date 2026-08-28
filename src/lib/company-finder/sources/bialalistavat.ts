// ---------- Biała Lista VAT — Polonia (Ministerstwo Finansów) ----------
// Mapping NIP -> KRS/REGON. Gratuita, senza chiave.
// Nota: in alcuni ambienti (es. sandbox) il dominio può essere inaccessibile:
// l'adapter è best-effort e non blocca il flusso.
// Endpoint: https://api.mf.gov.pl/ws/BIWL/V1/VatPayers/{nip}?status=active

export interface BialaListaResult {
  ok: boolean;
  krs?: string | undefined;
  regon?: string | undefined;
  onList?: boolean | undefined;
  error?: string | undefined;
}

export async function lookupNip(nip: string, timeoutMs = 9000): Promise<BialaListaResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.mf.gov.pl/ws/BIWL/V1/VatPayers/${nip}?status=active`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `Biała Lista HTTP ${res.status}` };
    const json = await res.json();
    const arr = Array.isArray(json) ? json : [json];
    const first = arr[0];
    if (!first) return { ok: true, onList: false };
    const krs = first.krs != null ? String(first.krs).replace(/\D/g, "") : undefined;
    const regon = first.regon != null ? String(first.regon) : undefined;
    return {
      ok: true,
      krs: krs && krs.length >= 6 ? krs.padStart(8, "0") : undefined,
      regon,
      onList: true,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Biała Lista: errore di rete",
    };
  } finally {
    clearTimeout(timer);
  }
}
