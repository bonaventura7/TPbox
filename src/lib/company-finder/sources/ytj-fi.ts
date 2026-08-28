// ---------- YTJ — Finlandia: Yritys- ja Toimipaikkajärjestelmä (PRH) ----------
// Open data ufficiale del Finnish Patent and Registration Office, nessuna chiave.
// API (verificata live 2026-08, 200 OK):
//   GET https://avoindata.prh.fi/opendata-ytj-api/v3/companies?name={query}
//   → { totalResults, companies: [{ businessId, names, companyForms,
//        mainBusinessLine, addresses, registrationDate, status }] }
// Nota: il vecchio endpoint /avoindata-api/ytj/v3/vayla è stato ritirato (404);
// il catalogo open data PRH è stato migrato alla nuova host/path qui sopra.

import type { ActivityCode, CompanyProfile, Identifier } from "../types";
import { getCountry } from "../countries";

const YTJ_BASE = "https://avoindata.prh.fi/opendata-ytj-api/v3";

export interface YtjResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
}

interface YtjName {
  name?: string | undefined;
  type?: string | undefined; // '1' = toiminimi (nome ufficiale)
  endDate?: string | undefined;
  registrationDate?: string | undefined;
}

interface YtjDescription {
  languageCode?: string | undefined; // '1' fi, '2' sv, '3' en
  description?: string | undefined;
}

interface YtjForm {
  type?: string | undefined;
  descriptions?: YtjDescription[] | undefined;
  endDate?: string | undefined;
}

interface YtjBusinessLine {
  code?: string | undefined;
  type?: string | undefined; // v3: il codice attività è in "type" (typeCodeSet TOIMI4)
  descriptions?: YtjDescription[] | undefined;
}

// Codi stato YTJ (status, v3/description?code=STATUS3)
const YTJ_STATUS_IT: Record<string, string> = {
  "1": "registrata (in via di iscrizione)",
  "2": "attiva",
  "5": "non valida / radiata",
};

interface YtjPostOffice {
  city?: string | undefined;
  languageCode?: string | undefined;
}

interface YtjAddress {
  type?: number | undefined; // 1 = katuosoite (indirizzo stradale), 2 = postiosoite
  street?: string | undefined;
  buildingNumber?: string | undefined;
  postCode?: string | undefined;
  postOffices?: YtjPostOffice[] | undefined;
}

interface YtjStatus {
  code?: string | undefined;
  descriptions?: YtjDescription[] | undefined;
}

interface YtjCompany {
  businessId?: { value?: string | undefined; registrationDate?: string } | undefined;
  names?: YtjName[] | undefined;
  companyForms?: YtjForm[] | undefined;
  mainBusinessLine?: YtjBusinessLine | undefined;
  otherBusinessLines?: YtjBusinessLine[] | undefined;
  addresses?: YtjAddress[] | undefined;
  registrationDate?: string | undefined;
  status?: string | YtjStatus | undefined;
}

/** Prende la descrizione nella lingua preferita (en → fi → sv). */
function descByLang(
  descriptions: YtjDescription[] | undefined,
  preferred: string[] = ["3", "1", "2"],
): string | undefined {
  if (!descriptions?.length) return undefined;
  for (const lang of preferred) {
    const hit = descriptions.find((d) => d.languageCode === lang && d.description);
    if (hit?.description) return hit.description;
  }
  const any = descriptions.find((d) => d.description);
  return any?.description;
}

/** Nome corrente: toiminimi (type 1) senza data di cessazione. */
function currentName(names: YtjName[] | undefined): string | undefined {
  if (!names?.length) return undefined;
  const active = names.filter((n) => !n.endDate && n.type === "1");
  const pool = active.length
    ? active
    : names.filter((n) => !n.endDate).length
      ? names.filter((n) => !n.endDate)
      : names;
  pool.sort((a, b) => (a.registrationDate ?? "").localeCompare(b.registrationDate ?? ""));
  return pool.map((n) => n.name).find(Boolean);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-zà-öø-ÿ0-9]/g, "");
}

function similarity(name: string, query: string): number {
  const a = norm(name);
  const b = norm(query);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.9;
  if (a.includes(b) || b.includes(a)) return 0.75;
  return 0;
}

/** Sceglie il migliore tra i risultati: Y-tunnus esatto > similarità nome. */
function pickBest(companies: YtjCompany[], query: string): YtjCompany | undefined {
  if (!companies.length) return undefined;
  const q = query.trim();
  const byId = companies.find((c) => c.businessId?.value?.toLowerCase() === q.toLowerCase());
  if (byId) return byId;
  let best: YtjCompany | undefined;
  let bestScore = 0;
  for (const c of companies) {
    const score = similarity(currentName(c.names) ?? "", q);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ?? companies[0];
}

export async function searchYtj(query: string, timeoutMs = 15000): Promise<YtjResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const q = query.trim();
    // Y-tunnus (7 cifre + trattino + 1 cifra) → ricerca esatta per businessId.
    const param = /^\d{7}-\d$/.test(q)
      ? `businessId=${encodeURIComponent(q)}`
      : `name=${encodeURIComponent(q)}`;
    const url = `${YTJ_BASE}/companies?${param}&maxPageNumber=1`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TPbox-CompanyFinder/1.0 (server-side lookup)",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `YTJ HTTP ${res.status}` };
    const json = (await res.json()) as
      { totalResults?: number | undefined; companies?: YtjCompany[] } | undefined;
    const chosen = pickBest(json?.companies ?? [], query);
    if (!chosen) return { ok: false, error: "YTJ: nessuna corrispondenza" };

    const country = getCountry("FI")!;
    const form = chosen.companyForms?.find((f) => !f.endDate) ?? chosen.companyForms?.[0];
    const street = chosen.addresses?.find((a) => a.type === 1) ?? chosen.addresses?.[0];
    const city = (street?.postOffices ?? []).map((p) => p.city).find(Boolean);

    const activityCodes: ActivityCode[] = [];
    const pushBl = (bl: YtjBusinessLine | undefined) => {
      const code = bl?.code ?? bl?.type;
      if (code) activityCodes.push({ code: String(code), label: descByLang(bl?.descriptions) });
    };
    pushBl(chosen.mainBusinessLine);
    for (const bl of chosen.otherBusinessLines ?? []) pushBl(bl);

    const identifiers: Identifier[] = [];
    if (chosen.businessId?.value) {
      identifiers.push({ key: "Y-tunnus (Yritystunnus)", value: String(chosen.businessId.value) });
    }

    const profile: CompanyProfile = {
      name: currentName(chosen.names),
      nameSource: "YTJ (PRH, open data)",
      country,
      registry: {
        name: "Kaupparekisteri (Yritys- ja Toimipaikkajärjestelmä)",
        authority: "Patentti- ja rekisterihallitus (PRH)",
        // exactOptionalPropertyTypes: id omesso quando manca lo Y-tunnus.
        ...(chosen.businessId?.value ? { id: `Y-tunnus ${chosen.businessId.value}` } : {}),
      },
      legalForm: descByLang(form?.descriptions),
      status:
        typeof chosen.status === "string"
          ? YTJ_STATUS_IT[chosen.status]
          : chosen.status
            ? (descByLang(chosen.status.descriptions) ?? chosen.status.code)
            : undefined,
      registeredSince: chosen.businessId?.registrationDate ?? chosen.registrationDate,
      address: street?.street
        ? [street.street, street.buildingNumber, street.postCode, city]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        : undefined,
      activityCodes: activityCodes.length ? activityCodes : undefined,
      identifiers: identifiers.length ? identifiers : undefined,
    };
    return { ok: true, data: profile };
  } catch (e) {
    const err = e as { name?: string | undefined; message?: string } | undefined;
    return {
      ok: false,
      error: err?.name === "AbortError" ? "YTJ: timeout" : `YTJ: ${err?.message ?? "errore"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
