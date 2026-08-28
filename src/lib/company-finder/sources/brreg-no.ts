// ---------- Brønnøysundregistrene — Norvegia (EEE) ----------
// Enhetsregisteret: API pubblica, gratuita, senza chiave.
// Docs: https://api.brreg.no/enhetsregisteret/api/
// NOTE: il dominio può non risolvere da alcuni ambienti (DNS): in produzione
// è raggiungibile. L'adapter è best-effort.

import type { ActivityCode, CompanyProfile, Identifier } from "../types";
import { getCountry } from "../countries";

// Il dominio api.brreg.no può non risolvere da alcune reti (es. sandbox):
// data.brreg.no espone la stessa API (open data) e funziona come fallback.
const BASES = [
  "https://api.brreg.no/enhetsregisteret/api",
  "https://data.brreg.no/enhetsregisteret/api",
];

export interface BrregResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
}

interface BrregEnhet {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: { beskrivelse?: string } | undefined;
  status?: { aktiv?: boolean | undefined; type?: string } | undefined;
  forretningsadresse?:
    | { gateadresse?: string | undefined; postnummer?: string | undefined; poststed?: string }
    | undefined;
  naeringskode1?: { kode?: string | undefined; beskrivelse?: string } | undefined;
  naeringskode2?: { kode?: string | undefined; beskrivelse?: string } | undefined;
  antallAnsatte?: number | undefined;
  registreringsdatoEnhetsregisteret?: string | undefined;
  hjemmeside?: string | undefined;
  epost?: string | undefined;
}

export async function searchBrreg(query: string, timeoutMs = 12000): Promise<BrregResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Orgnr (9 cifre) → ricerca esatta per numero; altrimenti per nome.
    const isOrgnr = /^\d{9}$/.test(query.replace(/\s/g, ""));
    const param = isOrgnr
      ? `orgnr=${query.replace(/\s/g, "")}`
      : `navn=${encodeURIComponent(query)}`;
    let lastErr: unknown = null;
    let json: Record<string, unknown> | undefined;
    let httpStatus: number | undefined;
    for (const base of BASES) {
      try {
        const res = await fetch(`${base}/enheter?${param}&size=5`, {
          headers: { Accept: "application/json" },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          httpStatus = res.status;
          if (res.status === 404) return { ok: false, error: "brreg: nessuna corrispondenza" };
          continue;
        }
        json = await res.json();
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!json) {
      return {
        ok: false,
        error: httpStatus
          ? `brreg HTTP ${httpStatus}`
          : lastErr instanceof Error
            ? lastErr.message
            : "brreg: errore di rete",
      };
    }
    const items = ((json as { _embedded?: { enheter?: BrregEnhet[] } })._embedded?.enheter ||
      []) as BrregEnhet[];
    if (items.length === 0) return { ok: false, error: "brreg: nessuna corrispondenza" };
    // preferisci entità attive; il caso `items.length === 0` è già escluso sopra,
    // quindi items[0] è sempre presente.
    const e = items.find((i) => i.status?.aktiv) || items[0]!;
    const country = getCountry("NO")!;
    const activityCodes: ActivityCode[] = [e.naeringskode1, e.naeringskode2]
      .filter(Boolean)
      .map((c) => ({
        code: c!.kode ? String(c!.kode) : "",
        label: c!.beskrivelse ? String(c!.beskrivelse).toLowerCase() : undefined,
      }));
    const profile: CompanyProfile = {
      name: e.navn,
      nameSource: "Brønnøysundregistrene",
      country,
      registry: {
        name: "Enhetsregisteret",
        authority: "Skatteetaten (Norway)",
        id: `org.nr ${e.organisasjonsnummer}`,
      },
      legalForm: e.organisasjonsform?.beskrivelse
        ? String(e.organisasjonsform.beskrivelse).toLowerCase()
        : undefined,
      status: e.status?.aktiv ? "aktiv" : "inaktiv",
      registeredSince: e.registreringsdatoEnhetsregisteret,
      address: e.forretningsadresse
        ? [
            e.forretningsadresse.gateadresse,
            e.forretningsadresse.postnummer,
            e.forretningsadresse.poststed,
          ]
            .filter(Boolean)
            .join(", ")
            .toLowerCase()
        : undefined,
      employees: e.antallAnsatte,
      website: e.hjemmeside ? String(e.hjemmeside).toLowerCase() : undefined,
      email: e.epost ? String(e.epost).toLowerCase() : undefined,
      activityCodes,
      identifiers: [{ key: "Organisasjonsnummer", value: e.organisasjonsnummer }],
    };
    return { ok: true, data: profile };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "brreg: errore di rete" };
  } finally {
    clearTimeout(timer);
  }
}
