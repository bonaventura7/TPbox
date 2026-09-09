import type { CompanyProfile, Financials, FinancialDocumentSummary } from "../../types";
import { resolveGreekFilingUrl } from "../../greek-filing";
import { parseGreekFinancialDocument } from "./gemi-gr-financials";

const GEMI_BASE = "https://opendata-api.businessportal.gr/api/opendata/v1";
const PUBLICITY_BASE = "https://publicity.businessportal.gr";
const FINANCIAL_TERMS = [
  /οικονομικ/i,
  /ισολογισ/i,
  /χρηματοοικονομ/i,
  /financial/i,
  /annual accounts?/i,
  /annual report/i,
  /balance sheet/i,
  /financial statements?/i,
  /accounts?/i,
  /ixbrl/i,
];
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_TEXT = 8_000_000;

interface GemiCompany {
  arGemi?: number;
  afm?: string;
  coNameEl?: string;
  coNamesEn?: string[];
  city?: string;
  street?: string;
  streetNumber?: string;
  zipCode?: string;
  email?: string;
  url?: string;
  incorporationDate?: string;
  lastStatusChange?: string;
  status?: { descr?: string };
  legalType?: { descr?: string };
  activities?: Array<{ activity?: { id?: string; descr?: string } }>;
  capital?: Array<{ capitalStock?: number; currency?: string }>;
}

interface GemiDecision {
  dateAssemblyDecided?: string;
  summary?: string;
  decisionSubject?: string;
  decisionSubjectID?: string;
  dateAnnounced?: string;
  assemblyDecisionUrl?: string;
  referenceKak?: string;
}

interface GemiDocuments {
  decision?: GemiDecision[];
  publication?: Array<{ url?: string; kad?: string }>;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function gemiFromInput(localVat: string, query: string): string | undefined {
  const candidates = [localVat, query];
  for (const candidate of candidates) {
    const value = digits(candidate);
    if (/^\d{10,12}$/.test(value)) return value;
  }
  return undefined;
}

export function looksLikeGreekFinancialDocument(input: {
  summary?: string;
  decisionSubject?: string;
  url?: string;
}): boolean {
  const text = [input.summary, input.decisionSubject, input.url].filter(Boolean).join(" ");
  return FINANCIAL_TERMS.some((term) => term.test(text));
}

function isAllowedDocumentUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      ["filings.businessportal.gr", "publicity.businessportal.gr"].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

function yearFromDate(value?: string): number | undefined {
  const match = value?.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function toCompanyProfile(company: GemiCompany): CompanyProfile {
  const address = [company.street, company.streetNumber, company.zipCode, company.city]
    .filter(Boolean)
    .join(" ");
  const capital = company.capital?.find((entry) => entry.capitalStock != null);
  return {
    name: company.coNamesEn?.[0] || company.coNameEl,
    nameSource: "GEMI Open Data",
    vat: company.afm ? { number: `EL${company.afm}`, country: "EL", valid: null } : undefined,
    country: {
      iso: "GR",
      nameIt: "Grecia",
      flag: "🇬🇷",
      vatPrefix: "EL",
      registryName: "ΓΕΜΗ (GEMI) — Business Portal",
      registryAuthority: "Ministero dello Sviluppo",
      financials: { free: true, note: "Documenti finanziari pubblici GEMI" },
    },
    registry: {
      name: "GEMI",
      authority: "Business Portal",
      ...(company.arGemi ? { id: company.arGemi.toString() } : {}),
    },
    legalForm: company.legalType?.descr,
    status: company.status?.descr,
    registeredSince: company.incorporationDate,
    lastRegistryUpdate: company.lastStatusChange,
    address: address || undefined,
    website: company.url,
    email: company.email,
    capital:
      capital?.capitalStock != null
        ? `${capital.capitalStock} ${capital.currency ?? "EUR"}`
        : undefined,
    activityCodes: company.activities?.flatMap((entry) =>
      entry.activity?.id ? [{ code: entry.activity.id, label: entry.activity.descr }] : [],
    ),
  };
}

async function requestJson<T>(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetchImpl(url, {
        headers: { api_key: apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.ok) return { ok: true, data: (await response.json()) as T };
      if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
        return { ok: false, status: response.status };
      }
    } catch {
      if (attempt === MAX_ATTEMPTS) return { ok: false, status: 503 };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
  }
  return { ok: false, status: 503 };
}

async function requestPublicDocument(
  url: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; text: string } | { ok: false; status: number }> {
  if (!isAllowedDocumentUrl(url)) return { ok: false, status: 400 };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "text/html,application/xhtml+xml,text/plain" },
        signal: controller.signal,
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
          return { ok: false, status: 415 };
        }
        const text = await response.text();
        if (text.length > MAX_DOCUMENT_TEXT) return { ok: false, status: 413 };
        return { ok: true, text };
      }
      if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
        return { ok: false, status: response.status };
      }
    } catch {
      if (attempt === MAX_ATTEMPTS) return { ok: false, status: 503 };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
  }
  return { ok: false, status: 503 };
}

async function resolveCompany(
  localVat: string,
  query: string,
  apiKey: string,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<GemiCompany | undefined> {
  const gemi = gemiFromInput(localVat, query);
  if (gemi) {
    const result = await requestJson<GemiCompany>(
      `${GEMI_BASE}/companies/${encodeURIComponent(gemi)}`,
      apiKey,
      signal,
      fetchImpl,
    );
    return result.ok ? result.data : undefined;
  }

  const params = new URLSearchParams();
  const afm = digits(localVat);
  if (/^\d{9}$/.test(afm)) params.set("afm", afm);
  else if (query.trim().length >= 3) params.set("name", query.trim());
  else return undefined;
  params.set("resultsSize", "20");

  const result = await requestJson<{ searchResults?: GemiCompany[] }>(
    `${GEMI_BASE}/companies?${params.toString()}`,
    apiKey,
    signal,
    fetchImpl,
  );
  return result.ok ? result.data.searchResults?.[0] : undefined;
}

function mapDocuments(gemi: string, docs: GemiDocuments): FinancialDocumentSummary[] {
  return (docs.decision ?? [])
    .filter((decision) =>
      looksLikeGreekFinancialDocument({
        ...(decision.summary ? { summary: decision.summary } : {}),
        ...(decision.decisionSubject ? { decisionSubject: decision.decisionSubject } : {}),
        ...(decision.assemblyDecisionUrl ? { url: decision.assemblyDecisionUrl } : {}),
      }),
    )
    .map((decision, index) => {
      const url = isAllowedDocumentUrl(decision.assemblyDecisionUrl)
        ? decision.assemblyDecisionUrl
        : undefined;
      return {
        id: `${gemi}-${decision.referenceKak ?? decision.decisionSubjectID ?? index}`,
        year: yearFromDate(decision.dateAssemblyDecided ?? decision.dateAnnounced),
        kind: "ANNUAL_REPORT" as const,
        format: url?.includes("ixbrl") ? ("html" as const) : ("pdf" as const),
        availability: url ? ("DOCUMENT_DOWNLOADABLE" as const) : ("DOCUMENT_FOUND" as const),
        restriction: url ? undefined : ("SOURCE_RESTRICTION" as const),
        title: decision.summary || decision.decisionSubject || "GEMI financial filing",
        ...(url ? { downloadUrl: url } : {}),
      };
    });
}

export async function fetchGreekFinancials(options: {
  localVat: string;
  query: string;
  apiKey?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  resolveFilingUrlImpl?: (gemi: string, signal?: AbortSignal) => Promise<string | undefined>;
}): Promise<
  { ok: true; profile?: CompanyProfile; financials: Financials } | { ok: false; skipped: string }
> {
  const apiKey = options.apiKey?.trim();

  if (apiKey) {
    const company = await resolveCompany(
      options.localVat,
      options.query,
      apiKey,
      options.signal,
      options.fetchImpl,
    );
    if (company?.arGemi) {
      const gemi = String(company.arGemi);
      const docsResult = await requestJson<GemiDocuments>(
        `${GEMI_BASE}/companies/${encodeURIComponent(gemi)}/documents`,
        apiKey,
        options.signal,
        options.fetchImpl,
      );
      if (docsResult.ok) {
        const documents = mapDocuments(gemi, docsResult.data);
        const first = documents.find((document) => document.downloadUrl);
        return {
          ok: true,
          profile: toCompanyProfile(company),
          financials: {
            available: documents.length > 0,
            years: documents
              .filter((document) => document.year)
              .map((document) => ({
                periodLabel: String(document.year),
                year: document.year,
                currency: "EUR",
              })),
            currency: "EUR",
            source: "GEMI Open Data",
            availability: first
              ? "DOCUMENT_DOWNLOADABLE"
              : documents.length
                ? "DOCUMENT_FOUND"
                : "REGISTRY_ONLY",
            documentUrl: first?.downloadUrl,
            documentTitle: first?.title,
            documents,
            note: documents.length
              ? "Documenti finanziari pubblici individuati nel fascicolo GEMI."
              : "Nessun documento finanziario riconoscibile nel fascicolo pubblico restituito da GEMI.",
          },
        };
      }
    }
  }

  const gemi = gemiFromInput(options.localVat, options.query);
  if (!gemi) {
    return {
      ok: false,
      skipped: apiKey
        ? "GEMI non risolto dalla query fornita"
        : "Per il recupero automatico serve il numero GEMI oppure una GEMI_API_KEY per risolvere IVA/nome",
    };
  }

  try {
    const resolveFiling = options.resolveFilingUrlImpl ?? resolveGreekFilingUrl;
    const url = await resolveFiling(gemi, options.signal);
    if (url && isAllowedDocumentUrl(url)) {
      const document = await requestPublicDocument(url, options.signal, options.fetchImpl);
      const parsed = document.ok
        ? parseGreekFinancialDocument({ text: document.text, sourceUrl: url })
        : undefined;
      const years = parsed?.matched ? parsed.years : [];
      const title = parsed?.matched
        ? `GEMI — bilancio iXBRL (${years.map((year) => year.periodLabel).join(", ")})`
        : "GEMI — bilancio / filing iXBRL";
      return {
        ok: true,
        financials: {
          available: true,
          years,
          currency: "EUR",
          source: "GEMI Publicity — filing iXBRL pubblico",
          availability: "DOCUMENT_DOWNLOADABLE",
          documentUrl: url,
          documentTitle: title,
          documents: [
            {
              id: `${gemi}-public-ixbrl`,
              kind: "ANNUAL_REPORT",
              format: "html",
              availability: "DOCUMENT_DOWNLOADABLE",
              title,
              downloadUrl: url,
            },
          ],
          note: parsed?.matched
            ? `Valori finanziari estratti dal filing iXBRL pubblico con confidenza ${parsed.confidence}.`
            : "Filing iXBRL pubblico individuato; estrazione strutturata non confermata dal parser.",
        },
      };
    }
  } catch {
    // La pagina pubblica può richiedere CAPTCHA/sessione: nessun bypass.
  }

  return {
    ok: false,
    skipped: `Nessun filing iXBRL pubblico risolto per GEMI ${gemi}; consultazione ufficiale disponibile su ${PUBLICITY_BASE}/company/${gemi}`,
  };
}
