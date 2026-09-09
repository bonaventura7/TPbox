/**
 * Liasse fiscale francese — dai «bilans saisis» dell'INPI alle voci di bilancio.
 *
 * L'API del Registre National des Entreprises restituisce il bilancio depositato
 * già digitato («bilan saisi»), organizzato in pagine, ciascuna con un elenco di
 * «liasses»: una riga della liasse fiscale identificata dal suo codice, con
 * quattro colonne monetarie m1..m4. Il significato delle colonne cambia con la
 * pagina, ed è la prima trappola di questa fonte.
 *
 * Convenzioni delle colonne (documentazione tecnica INPI API comptes annuels v5):
 *   - conto economico, pagina 03: m1 = Francia N, m2 = Export N, m3 = Totale N,
 *     m4 = Totale N-1;
 *   - conto economico, pagina 04: m1 = N, m2 = N-1;
 *   - attivo, pagina 01: m1 = lordo, m2 = ammortamenti, m3 = netto N, m4 = netto N-1;
 *   - passivo, pagina 02: m1 = N, m2 = N-1;
 *   - regime semplificato: m1 = N, m2 = N-1.
 *
 * Ogni riga della tabella porta la propria provenienza. `documentata` significa
 * che codice e colonna vengono dalla documentazione tecnica INPI; `daVerificare`
 * significa che il codice viene dalla modulistica CERFA e va confermato sulla
 * prima risposta reale prima di considerarlo acquisito. Nessun valore viene
 * dedotto o stimato: se il codice non c'è, la voce resta assente.
 */

import type { FinancialYear } from "../../types";

export type LiasseColumn = "m1" | "m2" | "m3" | "m4";
export type MappingProvenance = "documentata" | "daVerificare";

/** Tipo di bilancio depositato, campo `codeTypeBilan` dell'INPI. */
export type BilanType = string;

export interface LiasseRule {
  /** Codice della riga nella liasse (p. es. "FJ", "HN", "110"). */
  code: string;
  /** Colonna che porta l'esercizio corrente. */
  current: LiasseColumn;
  /** Colonna che porta l'esercizio precedente, se la pagina la espone. */
  previous?: LiasseColumn | undefined;
  label: string;
  provenance: MappingProvenance;
}

export type LiasseField =
  | "revenue"
  | "operatingRevenue"
  | "operatingCosts"
  | "operatingProfit"
  | "ordinaryProfit"
  | "netIncome"
  | "totalAssets"
  | "totalLiabilitiesAndEquity"
  | "equity"
  | "depreciation";

export type LiasseMap = Partial<Record<LiasseField, LiasseRule>>;

/**
 * Regime normale (comptes annuels complets) e consolidato: la documentazione
 * INPI dichiara che il tipo K ricalca il tipo C per pagine e codici.
 */
const COMPLET: LiasseMap = {
  revenue: { code: "FJ", current: "m3", previous: "m4", label: "Chiffres d'affaires nets", provenance: "documentata" },
  operatingRevenue: { code: "FR", current: "m3", previous: "m4", label: "Total des produits d'exploitation", provenance: "documentata" },
  operatingCosts: { code: "GF", current: "m3", previous: "m4", label: "Total des charges d'exploitation", provenance: "daVerificare" },
  operatingProfit: { code: "GG", current: "m3", previous: "m4", label: "Résultat d'exploitation", provenance: "documentata" },
  ordinaryProfit: { code: "GW", current: "m3", previous: "m4", label: "Résultat courant avant impôts", provenance: "documentata" },
  netIncome: { code: "HN", current: "m1", previous: "m2", label: "Bénéfice ou perte", provenance: "documentata" },
  totalAssets: { code: "CO", current: "m3", previous: "m4", label: "Total général actif", provenance: "documentata" },
  totalLiabilitiesAndEquity: { code: "EE", current: "m1", previous: "m2", label: "Total général passif", provenance: "documentata" },
  equity: { code: "DL", current: "m1", previous: "m2", label: "Total des capitaux propres", provenance: "daVerificare" },
  depreciation: { code: "0N", current: "m3", previous: "m4", label: "Dotations aux amortissements", provenance: "documentata" },
};

/** Regime semplificato (2033-A/B): codici numerici, due sole colonne. */
const SIMPLIFIE: LiasseMap = {
  operatingProfit: { code: "270", current: "m1", previous: "m2", label: "Résultat d'exploitation", provenance: "documentata" },
  netIncome: { code: "310", current: "m1", previous: "m2", label: "Résultat net", provenance: "documentata" },
  totalAssets: { code: "110", current: "m3", previous: "m4", label: "Total actif", provenance: "documentata" },
  equity: { code: "142", current: "m3", previous: "m4", label: "Total capitaux propres", provenance: "documentata" },
  depreciation: { code: "254", current: "m1", previous: "m2", label: "Dotations aux amortissements", provenance: "documentata" },
};

export const LIASSE_MAPS: Record<string, LiasseMap> = {
  C: COMPLET,
  K: COMPLET,
  A: COMPLET,
  AC: COMPLET,
  S: SIMPLIFIE,
};

export function liasseMapFor(bilanType: BilanType): LiasseMap | undefined {
  return LIASSE_MAPS[String(bilanType).toUpperCase()];
}

// ------------------------------------------------------------- estrazione

export interface LiasseRow {
  code: string;
  m1?: number | undefined;
  m2?: number | undefined;
  m3?: number | undefined;
  m4?: number | undefined;
}

export interface BilanSaisiInput {
  siren: string;
  /** `dateClotureExercice` dell'identità del bilancio (YYYY-MM-DD). */
  dateCloture: string;
  codeTypeBilan: BilanType;
  /** 0 pubblico, 1 integralmente confidenziale, 2 parziale, 3 pubblicazione semplificata, 4 relazione confidenziale. */
  codeConfidentialite?: number | undefined;
  /** 0 nessuna anomalia, 1 digitato con incoerenze, 2..24 non digitato. */
  codeSaisie?: number | undefined;
  rows: LiasseRow[];
  currency?: string | undefined;
}

export interface LiasseExtraction {
  ok: boolean;
  years: FinancialYear[];
  warnings: string[];
  /** Voci prese da una mappatura non ancora confermata sui dati reali. */
  unverifiedFields: LiasseField[];
  error?: string | undefined;
}

/** Tolleranza relativa dei controlli di quadratura. */
const BALANCE_TOLERANCE = 0.005;

function fiscalYearOf(dateCloture: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateCloture.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return undefined;
  // Una chiusura al 1° gennaio appartiene all'esercizio precedente, come in XBRL.
  return match[2] === "01" && match[3] === "01" ? year - 1 : year;
}

function pick(row: LiasseRow | undefined, column: LiasseColumn): number | undefined {
  if (!row) return undefined;
  const value = row[column];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function relativeGap(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale;
}

/**
 * Converte un bilancio digitato INPI in esercizi di bilancio.
 *
 * Il metodo non stima nulla. Applica la tabella dei codici, poi tre controlli di
 * quadratura sui dati estratti:
 *
 *  1. attivo = passivo. È un'identità contabile: se salta oltre la tolleranza,
 *     la lettura delle colonne è sbagliata e i numeri NON vengono restituiti.
 *  2. cifra d'affari <= totale dei proventi d'esercizio. Se salta, stessa conseguenza.
 *  3. risultato d'esercizio = proventi - oneri, quando entrambi sono presenti.
 *     Qui la differenza produce un avvertimento, non uno scarto: le voci
 *     rettificative del conto economico francese possono legittimamente
 *     spostare il saldo.
 *
 * Il primo e il secondo controllo esistono perché l'errore tipico di questa
 * fonte non è il numero mancante ma la colonna sbagliata, che restituisce un
 * numero plausibile e falso.
 */
export function extractFromBilanSaisi(input: BilanSaisiInput): LiasseExtraction {
  const warnings: string[] = [];
  const unverified = new Set<LiasseField>();

  if (input.codeConfidentialite === 1) {
    return {
      ok: false,
      years: [],
      warnings,
      unverifiedFields: [],
      error: "bilancio dichiarato integralmente confidenziale (codeConfidentialite = 1, art. L. 232-25 code de commerce)",
    };
  }
  if (input.codeSaisie !== undefined && input.codeSaisie >= 2) {
    return {
      ok: false,
      years: [],
      warnings,
      unverifiedFields: [],
      error: `bilancio depositato ma non digitato dall'INPI (codeSaisie = ${input.codeSaisie}): disponibile solo il PDF`,
    };
  }
  if (input.codeSaisie === 1) {
    warnings.push("l'INPI segnala incoerenze nella digitazione di questo bilancio (codeSaisie = 1): verificare le voci sul PDF");
  }
  if (input.codeConfidentialite === 2 || input.codeConfidentialite === 3) {
    warnings.push(
      `pubblicazione parziale o semplificata (codeConfidentialite = ${input.codeConfidentialite}): il conto economico può non essere depositato`,
    );
  }

  const map = liasseMapFor(input.codeTypeBilan);
  if (!map) {
    return {
      ok: false,
      years: [],
      warnings,
      unverifiedFields: [],
      error: `tipo di bilancio "${input.codeTypeBilan}" senza mappatura: le voci non vengono dedotte`,
    };
  }

  const byCode = new Map<string, LiasseRow>();
  for (const row of input.rows) {
    const code = row.code.trim().toUpperCase();
    if (code && !byCode.has(code)) byCode.set(code, row);
  }

  const currentYear = fiscalYearOf(input.dateCloture);
  if (currentYear === undefined) {
    return { ok: false, years: [], warnings, unverifiedFields: [], error: "data di chiusura non interpretabile" };
  }

  const read = (field: LiasseField, which: "current" | "previous"): number | undefined => {
    const rule = map[field];
    if (!rule) return undefined;
    const column = which === "current" ? rule.current : rule.previous;
    if (!column) return undefined;
    const value = pick(byCode.get(rule.code.toUpperCase()), column);
    if (value !== undefined && rule.provenance === "daVerificare") unverified.add(field);
    return value;
  };

  const currency = input.currency ?? "EUR";
  const years: FinancialYear[] = [];
  const blocking: string[] = [];

  for (const which of ["current", "previous"] as const) {
    const year = which === "current" ? currentYear : currentYear - 1;
    const revenue = read("revenue", which);
    const operatingRevenue = read("operatingRevenue", which);
    const operatingCosts = read("operatingCosts", which);
    const operatingProfit = read("operatingProfit", which);
    const netIncome = read("netIncome", which);
    const totalAssets = read("totalAssets", which);
    const totalLiabilitiesAndEquity = read("totalLiabilitiesAndEquity", which);
    const equity = read("equity", which);

    if (
      totalAssets !== undefined &&
      totalLiabilitiesAndEquity !== undefined &&
      relativeGap(totalAssets, totalLiabilitiesAndEquity) > BALANCE_TOLERANCE
    ) {
      blocking.push(`esercizio ${year}: totale attivo (${totalAssets}) e totale passivo (${totalLiabilitiesAndEquity}) non quadrano`);
      continue;
    }
    if (revenue !== undefined && operatingRevenue !== undefined && revenue > operatingRevenue * (1 + BALANCE_TOLERANCE)) {
      blocking.push(`esercizio ${year}: cifra d'affari (${revenue}) superiore al totale dei proventi d'esercizio (${operatingRevenue})`);
      continue;
    }
    if (
      operatingProfit !== undefined &&
      operatingRevenue !== undefined &&
      operatingCosts !== undefined &&
      relativeGap(operatingProfit, operatingRevenue - operatingCosts) > BALANCE_TOLERANCE
    ) {
      warnings.push(`esercizio ${year}: il risultato d'esercizio non coincide con proventi meno oneri; verificare le voci rettificative`);
    }

    const entry: FinancialYear = {
      periodLabel: which === "current" ? input.dateCloture : String(year),
      year,
      ...(revenue === undefined ? {} : { revenue }),
      ...(operatingProfit === undefined ? {} : { operatingProfit }),
      ...(netIncome === undefined ? {} : { netIncome }),
      ...(totalAssets === undefined ? {} : { totalAssets }),
      ...(equity === undefined ? {} : { equity }),
      ...(totalLiabilitiesAndEquity === undefined ? {} : { liabilitiesAndEquity: totalLiabilitiesAndEquity }),
      currency,
    };
    const hasValue =
      revenue !== undefined ||
      operatingProfit !== undefined ||
      netIncome !== undefined ||
      totalAssets !== undefined ||
      equity !== undefined;
    if (hasValue) years.push(entry);
  }

  if (blocking.length && !years.length) {
    return {
      ok: false,
      years: [],
      warnings,
      unverifiedFields: [...unverified],
      error: `controlli di quadratura non superati — ${blocking.join("; ")}`,
    };
  }
  for (const message of blocking) warnings.push(message);

  if (!years.length) {
    return {
      ok: false,
      years: [],
      warnings,
      unverifiedFields: [...unverified],
      error: "nessuna voce riconosciuta nella liassa: mappatura da completare per questo tipo di bilancio",
    };
  }

  return { ok: true, years, warnings, unverifiedFields: [...unverified] };
}

/**
 * Appiattisce la struttura `bilanSaisi.bilan.detail.pages[].liasses[]` dell'INPI
 * in righe con codice e quattro colonne. Accetta indifferentemente `montant1`
 * o `m1`, perché la documentazione usa entrambe le forme.
 */
export function flattenLiassePages(detail: unknown): LiasseRow[] {
  const rows: LiasseRow[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const code = record["code"];
    if (typeof code === "string" && code.trim()) {
      const num = (keys: string[]): number | undefined => {
        for (const key of keys) {
          const raw = record[key];
          if (typeof raw === "number" && Number.isFinite(raw)) return raw;
          if (typeof raw === "string" && raw.trim()) {
            const parsed = Number(raw.replace(/\s/g, "").replace(",", "."));
            if (Number.isFinite(parsed)) return parsed;
          }
        }
        return undefined;
      };
      const m1 = num(["m1", "montant1"]);
      const m2 = num(["m2", "montant2"]);
      const m3 = num(["m3", "montant3"]);
      const m4 = num(["m4", "montant4"]);
      if (m1 !== undefined || m2 !== undefined || m3 !== undefined || m4 !== undefined) {
        rows.push({
          code: code.trim(),
          ...(m1 === undefined ? {} : { m1 }),
          ...(m2 === undefined ? {} : { m2 }),
          ...(m3 === undefined ? {} : { m3 }),
          ...(m4 === undefined ? {} : { m4 }),
        });
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(detail);
  return rows;
}
