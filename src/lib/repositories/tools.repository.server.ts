import {
  DEMO_COMPANIES,
  DEMO_FINANCIALS,
  DEMO_FINANCIALS_FALLBACK,
} from "../domain/demo-data";
import type {
  BilancioResult,
  CompanySearchResult,
  CompanySearchMode,
  AppRole,
} from "../domain/types";
import { FEATURE_FLAGS } from "../platform/feature-flags";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
  retryIdempotent,
  withTimeout,
} from "../platform/resilience.server";

const breaker = new CircuitBreaker();

const VAT_PATTERN = /^[A-Z]{0,2}\s?[0-9]{8,12}$/i;

function classifyQuery(raw: string): CompanySearchMode {
  const value = raw.trim();
  if (value.length < 3) return "INVALID_INPUT";
  const compact = value.replace(/[\s.-]/g, "");
  if (/[0-9]/.test(compact)) {
    return VAT_PATTERN.test(compact) ? "VAT_SEARCH" : "INVALID_INPUT";
  }
  return "NAME_SEARCH";
}

export async function searchCompanies(input: {
  query: string;
  country: string;
}): Promise<CompanySearchResult> {
  const correlationId = newCorrelationId();
  const mode = classifyQuery(input.query);

  if (mode === "INVALID_INPUT") {
    audit({
      correlationId,
      action: "company.search",
      actorRole: "USER",
      at: new Date().toISOString(),
      outcome: "DENIED",
      detail: "input non valido",
    });
    return {
      correlationId,
      mode,
      message:
        "Inserisci una ragione sociale di almeno tre caratteri oppure un numero di partita IVA valido (8-12 cifre, con eventuale prefisso paese).",
      candidates: [],
    };
  }

  const candidates = await withTimeout(async () =>
    retryIdempotent(async () => {
      breaker.recordSuccess();
      const term = input.query.trim().toLowerCase();
      const pool = DEMO_COMPANIES.filter((company) =>
        input.country === "" ? true : company.country === input.country,
      );
      if (mode === "VAT_SEARCH") return pool.slice(0, 1);
      const byName = pool.filter((company) =>
        company.legalName.toLowerCase().includes(term),
      );
      return byName.length > 0 ? byName : pool.slice(0, 3);
    }),
  );

  audit({
    correlationId,
    action: "company.search",
    actorRole: "USER",
    at: new Date().toISOString(),
    outcome: "OK",
    detail: `${mode}: ${candidates.length} candidati`,
  });

  return {
    correlationId,
    mode,
    message:
      mode === "VAT_SEARCH"
        ? "Ricerca per numero di partita IVA: risultato dimostrativo."
        : "Ricerca per ragione sociale: risultati dimostrativi. Seleziona la società corretta.",
    candidates,
  };
}

function ratios(revenue: number, ebit: number, equity: number, assets: number) {
  return [
    { label: "Margine operativo (EBIT / ricavi)", value: `${((ebit / revenue) * 100).toFixed(1)}%` },
    { label: "Rotazione attivo (ricavi / attivo)", value: (revenue / assets).toFixed(2) },
    { label: "Patrimonializzazione (equity / attivo)", value: `${((equity / assets) * 100).toFixed(1)}%` },
  ];
}

export async function fetchBilancio(input: {
  companyId: string;
  role: AppRole;
  simulate?: "OK" | "PROVIDER_UNAVAILABLE" | "RATE_LIMITED" | "DEGRADED";
}): Promise<BilancioResult> {
  const correlationId = newCorrelationId();
  const company = DEMO_COMPANIES.find((item) => item.companyId === input.companyId);

  const base: Omit<BilancioResult, "status" | "message"> = {
    correlationId,
    companyId: input.companyId,
    legalName: company?.legalName ?? null,
    years: [],
    ratios: [],
    isDemo: true,
  };

  if (!company) {
    return {
      ...base,
      status: "NOT_FOUND",
      message:
        "La società indicata non risulta risolta. Torna a Company Finder e seleziona una società dai risultati.",
    };
  }

  const authorized = input.role === "PRO" || input.role === "ADMIN" || FEATURE_FLAGS.bilancioProAccess;
  if (!authorized) {
    audit({
      correlationId,
      action: "bilancio.fetch",
      actorRole: input.role,
      at: new Date().toISOString(),
      outcome: "DENIED",
      detail: "profilo non abilitato",
    });
    return {
      ...base,
      status: "NOT_AUTHORIZED",
      message:
        "Funzione riservata al profilo PRO. In questa anteprima puoi consultare un estratto dimostrativo dei dati.",
    };
  }

  if (input.simulate === "PROVIDER_UNAVAILABLE" || !breaker.canPass()) {
    breaker.recordFailure();
    return {
      ...base,
      status: "PROVIDER_UNAVAILABLE",
      message:
        "Il servizio di reperimento bilanci non è momentaneamente raggiungibile. Riprova tra qualche minuto.",
    };
  }
  if (input.simulate === "RATE_LIMITED") {
    return {
      ...base,
      status: "RATE_LIMITED",
      message:
        "Hai raggiunto il limite di richieste consentite per questo intervallo di tempo. Attendi prima di ripetere la richiesta.",
    };
  }

  const years = await withTimeout(async () =>
    retryIdempotent(async () => {
      breaker.recordSuccess();
      return DEMO_FINANCIALS[input.companyId] ?? DEMO_FINANCIALS_FALLBACK;
    }),
  );

  const latest = years[0]!;
  audit({
    correlationId,
    action: "bilancio.fetch",
    actorRole: input.role,
    at: new Date().toISOString(),
    outcome: "OK",
  });

  return {
    ...base,
    status: input.simulate === "DEGRADED" ? "DEGRADED" : "OK",
    message:
      input.simulate === "DEGRADED"
        ? "Servizio in modalità ridotta: sono mostrati solo i dati essenziali già disponibili."
        : "Estratto dimostrativo dei dati economico-finanziari.",
    years: input.simulate === "DEGRADED" ? years.slice(0, 1) : years,
    ratios: ratios(latest.revenue, latest.ebit, latest.equity, latest.totalAssets),
  };
}