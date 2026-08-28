// ---------- KRS — Polonia: API aperta del Portal Rejestrów Sądowych ----------
// Fonte: Ministero della Giustizia PL. Gratuita, senza chiave.
// Endpoint: https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krs}?rejestr=P&format=json
// Nota GDPR: nomi delle persone fisiche oscurati (es. "F*****").

import type { ActivityCode, CompanyProfile, Identifier, Officer } from "../types";
import { getCountry } from "../countries";

const BASE = "https://api-krs.ms.gov.pl/api/krs";

export interface KrsResult {
  ok: boolean;
  data?: CompanyProfile | undefined;
  error?: string | undefined;
  notFound?: boolean | undefined;
}

function plDate(s?: string): string | undefined {
  // "06.04.2001" -> "2001-04-06"
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

export async function fetchKrsOdpis(krsNumber: string, timeoutMs = 15000): Promise<KrsResult> {
  // I numeri KRS sono a 10 cifre (zero-padding); i vecchi numeri a 8
  const krs = krsNumber.replace(/\D/g, "").padStart(10, "0");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/OdpisAktualny/${krs}?rejestr=P&format=json`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.status === 204 || res.status === 404) {
      return { ok: false, notFound: true, error: `KRS ${krs} non trovato` };
    }
    if (!res.ok) return { ok: false, error: `KRS HTTP ${res.status}` };
    const json = await res.json();
    const odpis = json?.odpis;
    if (!odpis) return { ok: false, error: "KRS: risposta non valida" };

    const nazwa = pick(odpis, ["dane", "dzial1", "danePodmiotu", "nazwa"]);
    const forma = pick(odpis, ["dane", "dzial1", "danePodmiotu", "formaPrawna"]);
    const nip = pick(odpis, ["dane", "dzial1", "danePodmiotu", "identyfikatory", "nip"]);
    const regon = pick(odpis, ["dane", "dzial1", "danePodmiotu", "identyfikatory", "regon"]);
    const kraj = pick(odpis, ["dane", "dzial1", "siedzibaIAdres", "siedziba", "kraj"]);
    const miejscowosc = pick(odpis, [
      "dane",
      "dzial1",
      "siedzibaIAdres",
      "siedziba",
      "miejscowosc",
    ]);
    const ulica = pick(odpis, ["dane", "dzial1", "siedzibaIAdres", "adres", "ulica"]);
    const nrDomu = pick(odpis, ["dane", "dzial1", "siedzibaIAdres", "adres", "nrDomu"]);
    const kodPocztowy = pick(odpis, ["dane", "dzial1", "siedzibaIAdres", "adres", "kodPocztowy"]);
    const sito = pick(odpis, ["dane", "dzial1", "siedzibaIAdres", "adresStronyInternetowej"]);
    const email = pick(odpis, ["dane", "dzial1", "siedzibaIAdres", "adresPocztyElektronicznej"]);

    const capW = pick(odpis, ["dane", "dzial1", "kapital", "wysokoscKapitaluZakladowego"]);
    const capital =
      capW && typeof capW === "object"
        ? `${String((capW as Record<string, unknown>)["wartosc"])} ${(capW as Record<string, unknown>)["waluta"]}`
        : undefined;

    // Organi: solo i ruoli (i nomi sono oscurati per GDPR nell'API aperta)
    const officers: Officer[] = asArr(pick(odpis, ["dane", "dzial2", "reprezentacja", "sklad"]))
      .map((o) => {
        const r = (o as Record<string, unknown>)?.["funkcjaWOrganie"];
        return typeof r === "string" ? { role: r.toLowerCase() } : null;
      })
      .filter((o): o is Officer => o !== null);

    // Codici attività PKD (dzial3)
    const pkdList: ActivityCode[] = [
      ...asArr(
        pick(odpis, [
          "dane",
          "dzial3",
          "przedmiotDzialalnosci",
          "przedmiotPrzewazajacejDzialalnosci",
        ]),
      ),
      ...asArr(
        pick(odpis, ["dane", "dzial3", "przedmiotDzialalnosci", "przedmiotPozostalejDzialalnosci"]),
      ),
    ]
      .map((p) => {
        const r = p as Record<string, unknown>;
        const parts = [r["kodDzial"], r["kodKlasa"], r["kodPodklasa"]].filter(
          (x) => x !== undefined && x !== null && x !== "",
        );
        const code = parts.join(".");
        return { code, label: typeof r["opis"] === "string" ? r["opis"].toLowerCase() : undefined };
      })
      .filter((a) => a.code && a.code !== ".");
    // dedup per codice
    const seen = new Set<string>();
    const activityCodes = pkdList.filter((a) =>
      seen.has(a.code) ? false : (seen.add(a.code), true),
    );

    const identifiers: Identifier[] = [];
    if (nip) identifiers.push({ key: "NIP (IVA)", value: String(nip) });
    if (regon) identifiers.push({ key: "REGON", value: String(regon) });

    const country = getCountry("PL")!;
    const profile: CompanyProfile = {
      name: typeof nazwa === "string" ? nazwa : undefined,
      nameSource: "KRS",
      country,
      registry: {
        name: "Krajowy Rejestr Sądowy (KRS)",
        authority: "Ministerstwo Sprawiedliwości",
        id: `KRS ${krs}`,
      },
      legalForm: typeof forma === "string" ? forma.toLowerCase() : undefined,
      status: "attiva",
      registeredSince: plDate(
        pick(odpis, ["naglowekA", "dataRejestracjiWKRS"]) as string | undefined,
      ),
      lastRegistryUpdate: plDate(
        pick(odpis, ["naglowekA", "dataOstatniegoWpisu"]) as string | undefined,
      ),
      address:
        ulica != null
          ? `${String(ulica).toLowerCase()}${nrDomu ? " " + String(nrDomu) : ""}, ${kodPocztowy ? kodPocztowy + " " : ""}${miejscowosc ? String(miejscowosc).toLowerCase() : ""}`
          : undefined,
      website: typeof sito === "string" ? sito.toLowerCase() : undefined,
      email: typeof email === "string" ? email.toLowerCase() : undefined,
      capital: typeof capital === "string" ? capital : undefined,
      activityCodes: activityCodes.slice(0, 12),
      officers: officers.slice(0, 10),
      identifiers,
    };
    return { ok: true, data: profile };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "KRS: errore di rete",
    };
  } finally {
    clearTimeout(timer);
  }
}
