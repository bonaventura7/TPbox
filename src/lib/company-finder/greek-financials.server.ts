// ---------- Grecia: dal ΓΕΜΗ al documento ufficiale, senza terze parti ----------
//
// Obiettivo: l'utente cerca una società greca e scarica il bilancio con un
// clic, restando sul sito. Nessun reindirizzamento al portale del registro.
//
// Canali, in ordine di affidabilità:
//   1. API aperta ΓΕΜΗ (opendata-api.businessportal.gr) — canale ufficiale per
//      i terzi, documentato, licenza ODC-BY-1.0. Richiede GEMI_API_KEY
//      (gratuita). Da qui arrivano identità, ΑΦΜ→ΓΕΜΗ ed elenco documenti.
//   2. Scheda pubblica publicity.businessportal.gr — solo se espone i link ai
//      documenti nell'HTML. La ricerca di quel portale è protetta da reCAPTCHA
//      e NON viene aggirata: si legge solo ciò che la pagina pubblica.
//
// In ogni caso il documento viene servito dal proxy in pagina
// (/api/company-finder/document): stessa origine, un clic, nessuna fonte terza
// percepita dall'utente.

import {
  documentDownloadUrl,
  documentFormat,
  documentViewerUrl,
  safeFileName,
} from "./document-links";
import { extractGreekDocumentLinks } from "./greek-filing";
import {
  extractGemiFromText,
  greekDownloadUrl,
  isGreekDocumentUrl,
  normalizeGemi,
  normalizeGreekVat,
  type GreekRegistryIds,
} from "./greece";
import type { FinancialDocumentRef, SearchResponse } from "./types";
import {
  collectGemiDocuments,
  documentYear,
  sortByDateDesc,
  type GemiDocumentCandidate,
} from "./sources/gemi-documents";
import {
  gemiApiKey,
  gemiDownloadFileUrl,
  getGemiDocumentsRaw,
  searchGemiCompanies,
  type GemiApiState,
  type GemiCompanySummary,
} from "./sources/gemi-opendata";

const PORTAL_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type GreekResolutionState =
  "DOCUMENT_FOUND" | "NO_IDENTIFIER" | "NO_KEY" | "NOT_FOUND" | "SOURCE_UNAVAILABLE";

export interface GreekDocument {
  label: string;
  year?: string | undefined;
  filedAt?: string | undefined;
  format?: string | undefined;
  fileName: string;
  /** URL ufficiale: viaggia solo tra server e proxy, mai mostrato all'utente. */
  sourceUrl: string;
  /** Stessa origine: apertura nel riquadro della scheda. */
  viewerUrl: string;
  /** Stessa origine: download con un clic. */
  downloadUrl: string;
}

export interface GreekResolution {
  state: GreekResolutionState;
  documents: GreekDocument[];
  company?: GemiCompanySummary | undefined;
  /** Motivo leggibile quando non c'è documento: finisce nella UI. */
  detail?: string | undefined;
  apiState?: GemiApiState | undefined;
}

export interface GreekSearchInput {
  gemi?: GreekRegistryIds | undefined;
  vat?: string | undefined;
  name?: string | undefined;
}

function toGreekDocument(
  label: string,
  sourceUrl: string,
  extras: { year?: string | undefined; filedAt?: string | undefined } = {},
): GreekDocument | undefined {
  if (!sourceUrl) return undefined;
  const fileName = safeFileName(
    label.match(/[^\s/\\]+\.(pdf|xls|xlsx|xml|xhtml|zip)/i)?.[0] ?? label,
    "bilancio-grecia",
  );
  const document: GreekDocument = {
    label: label.slice(0, 180),
    fileName,
    sourceUrl,
    viewerUrl: documentViewerUrl(sourceUrl),
    downloadUrl: documentDownloadUrl(sourceUrl, fileName),
  };
  const format = documentFormat(label, sourceUrl);
  if (format) document.format = format;
  if (extras.year) document.year = extras.year;
  if (extras.filedAt) document.filedAt = extras.filedAt;
  return document;
}

/** Un candidato dell'API aperta diventa un documento servibile dal proxy. */
function candidateToDocument(
  candidate: GemiDocumentCandidate,
  arGemi: string,
): GreekDocument | undefined {
  const year = documentYear(candidate);
  const extras = { year, filedAt: candidate.date };

  if (candidate.url) {
    const raw = candidate.url.trim();
    const absolute = raw.startsWith("http")
      ? raw
      : `https://publicity.businessportal.gr${raw.startsWith("/") ? "" : "/"}${raw}`;
    if (isGreekDocumentUrl(absolute)) return toGreekDocument(candidate.label, absolute, extras);
    if (/^https:\/\/opendata-api\.businessportal\.gr\//i.test(absolute)) {
      return toGreekDocument(candidate.label, absolute, extras);
    }
  }

  if (candidate.elementId) {
    const viaPortal = greekDownloadUrl(
      candidate.downloadKey ?? "financial",
      candidate.elementId,
      arGemi,
    );
    if (viaPortal && isGreekDocumentUrl(viaPortal)) {
      return toGreekDocument(candidate.label, viaPortal, extras);
    }
    const viaApi = gemiDownloadFileUrl(
      candidate.downloadKey ?? "assemblyDecision",
      candidate.elementId,
    );
    if (viaApi) return toGreekDocument(candidate.label, viaApi, extras);
  }

  return undefined;
}

/**
 * Lettura della scheda pubblica del portale. Non è il canale primario (il
 * portale protegge la ricerca con reCAPTCHA) ma quando la pagina espone i link
 * ai documenti questi sono pubblici e utilizzabili.
 */
async function readPortalDocuments(gemi: string, signal: AbortSignal): Promise<string[]> {
  const warmUp = await fetch("https://publicity.businessportal.gr/", {
    headers: { "User-Agent": PORTAL_UA, Accept: "text/html,application/xhtml+xml" },
    signal,
  }).catch(() => undefined);

  // Warm-up di sessione: riusiamo i cookie tecnici emessi dalla home. Nessuna
  // verifica anti-bot viene risolta o aggirata.
  const cookies = (warmUp?.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");

  const headers: Record<string, string> = {
    "User-Agent": PORTAL_UA,
    Accept: "text/html,application/xhtml+xml",
  };
  if (cookies) headers["Cookie"] = cookies;

  const response = await fetch(
    `https://publicity.businessportal.gr/company/${encodeURIComponent(gemi)}`,
    {
      headers,
      redirect: "follow",
      signal,
    },
  );
  if (!response.ok) return [];
  return extractGreekDocumentLinks(await response.text());
}

/**
 * Risolve i documenti ufficiali di una società greca.
 * Non inventa mai un URL: o il registro lo pubblica, o non c'è documento.
 */
export async function resolveGreekDocuments(
  input: GreekSearchInput,
  signal?: AbortSignal,
): Promise<GreekResolution> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let arGemi = input.gemi?.arGemi;
    let company: GemiCompanySummary | undefined;

    // 1) Identità: ΓΕΜΗ diretto, oppure ΑΦΜ/denominazione via API aperta.
    if (!arGemi && (input.vat || input.name) && gemiApiKey()) {
      const search = await searchGemiCompanies(
        { afm: input.vat, name: input.name },
        controller.signal,
      );
      const match = search.ok ? search.data?.[0] : undefined;
      if (match) {
        company = match;
        arGemi = match.arGemi.padStart(12, "0");
      } else if (search.state === "NOT_FOUND") {
        return { state: "NOT_FOUND", documents: [], detail: search.detail };
      }
    }

    if (!arGemi) {
      // Senza chiave non esiste alcun canale lecito per passare da ΑΦΜ o
      // denominazione al ΓΕΜΗ: lo diciamo con il motivo vero, non con un
      // generico "identificativo mancante".
      if (!gemiApiKey() && (input.vat || input.name)) {
        return {
          state: "NO_KEY",
          documents: [],
          detail:
            "Chiave API ΓΕΜΗ non configurata: per risalire dall'ΑΦΜ o dalla denominazione al numero ΓΕΜΗ (e quindi ai bilanci) serve GEMI_API_KEY, gratuita su opendata.businessportal.gr. In alternativa inserisci il numero ΓΕΜΗ (10-12 cifre).",
          apiState: "NO_KEY",
        };
      }
      return {
        state: "NO_IDENTIFIER",
        documents: [],
        detail: "Serve il numero ΓΕΜΗ (10-12 cifre) oppure un ΑΦΜ greco valido.",
      };
    }

    // 2) Documenti via API aperta ΓΕΜΗ.
    if (gemiApiKey()) {
      const raw = await getGemiDocumentsRaw(arGemi, controller.signal);
      if (raw.ok) {
        const candidates = collectGemiDocuments(raw.data);
        const financial = candidates.filter((candidate) => candidate.financial);
        const chosen = sortByDateDesc(financial.length ? financial : candidates);
        const documents = chosen
          .map((candidate) => candidateToDocument(candidate, arGemi!))
          .filter((doc): doc is GreekDocument => Boolean(doc))
          .slice(0, 8);

        if (!company) {
          const search = await searchGemiCompanies({ arGemi }, controller.signal);
          if (search.ok) company = search.data?.[0];
        }

        if (documents.length) {
          const result: GreekResolution = { state: "DOCUMENT_FOUND", documents };
          if (company) result.company = company;
          return result;
        }
      } else if (raw.state !== "NOT_FOUND") {
        return {
          state: "SOURCE_UNAVAILABLE",
          documents: [],
          detail: raw.detail,
          apiState: raw.state,
        };
      }
    }

    // 3) Ripiego: link ai documenti esposti dalla scheda pubblica.
    const gemi = input.gemi?.gemi ?? arGemi.replace(/^0+(?=\d)/, "");
    const portalLinks = await readPortalDocuments(gemi, controller.signal).catch(
      () => [] as string[],
    );
    const portalDocuments = portalLinks
      .map((link, index) =>
        toGreekDocument(
          `Documento ufficiale depositato${portalLinks.length > 1 ? ` (${index + 1})` : ""}`,
          link,
        ),
      )
      .filter((doc): doc is GreekDocument => Boolean(doc));

    if (portalDocuments.length) {
      const result: GreekResolution = { state: "DOCUMENT_FOUND", documents: portalDocuments };
      if (company) result.company = company;
      return result;
    }

    return {
      state: gemiApiKey() ? "NOT_FOUND" : "NO_KEY",
      documents: [],
      company,
      detail: gemiApiKey()
        ? "Nessun documento di bilancio pubblicato per questo ΓΕΜΗ nel registro."
        : "Chiave API ΓΕΜΗ non configurata: il download automatico dei bilanci greci richiede GEMI_API_KEY (gratuita).",
      apiState: gemiApiKey() ? undefined : "NO_KEY",
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Grecia: identità dal registro ΓΕΜΗ e documenti ufficiali serviti in pagina.
 * Se il registro non pubblica documenti, la scheda lo dice con il motivo —
 * non mostra un iframe morto e non rimanda a un sito terzo.
 */
function firstRegistryIdentifier(response: SearchResponse, fallback: string): string {
  return response.company?.registry?.id?.trim() || fallback.trim();
}

export async function applyGreekDocuments(
  response: SearchResponse,
  fallbackId: string,
  attachedDocumentUrl: string,
): Promise<SearchResponse> {
  if (response.company?.country.iso !== "GR") return response;

  const identifier = firstRegistryIdentifier(response, fallbackId);
  const gemi =
    normalizeGemi(identifier) ??
    extractGemiFromText(identifier) ??
    extractGemiFromText(response.company?.name ?? "");
  const vat =
    normalizeGreekVat(identifier) ?? normalizeGreekVat(response.company?.vat?.number ?? "");

  // Documento fornito dall'utente: validato, poi servito in pagina.
  if (attachedDocumentUrl && isGreekDocumentUrl(attachedDocumentUrl)) {
    const fileName = decodeURIComponent(
      new URL(attachedDocumentUrl).pathname.split("/").pop() ?? "documento",
    );
    const document: FinancialDocumentRef = {
      label: `Documento ufficiale — ΓΕΜΗ ${gemi?.arGemi ?? identifier}`,
      fileName,
      viewerUrl: documentViewerUrl(attachedDocumentUrl),
      downloadUrl: documentDownloadUrl(attachedDocumentUrl, fileName),
    };
    response.financials = {
      ...(response.financials ?? { available: false, years: [] }),
      documents: [document],
      documentUrl: document.viewerUrl,
      documentTitle: document.label,
      source: "ΓΕΜΗ — Registro generale del commercio",
      note: "Documento ufficiale greco servito da questa pagina: apertura in pagina e download con un clic.",
    };
    response.officialPage = undefined;
    return response;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const input: { gemi?: typeof gemi; vat?: string; name?: string } = {};
    if (gemi) input.gemi = gemi;
    if (vat) input.vat = vat;
    const name = response.company?.name?.trim();
    if (name) input.name = name;

    const resolution = await resolveGreekDocuments(input, controller.signal);

    if (resolution.company) {
      const registryCompany = resolution.company;
      response.company = {
        ...response.company,
        name: response.company?.name || registryCompany.nameEl || registryCompany.namesEn?.[0],
        nameSource: response.company?.nameSource ?? registryCompany.nameEl,
        legalForm: response.company?.legalForm ?? registryCompany.legalType,
        status: response.company?.status ?? registryCompany.status,
        registeredSince: response.company?.registeredSince ?? registryCompany.incorporationDate,
        address:
          response.company?.address ??
          ([
            registryCompany.street,
            registryCompany.streetNumber,
            registryCompany.zipCode,
            registryCompany.city,
          ]
            .filter(Boolean)
            .join(" ") ||
            undefined),
        website: response.company?.website ?? registryCompany.website,
        email: response.company?.email ?? registryCompany.email,
        capital: response.company?.capital ?? registryCompany.capital,
        registry: {
          name: "ΓΕΜΗ — Registro generale del commercio",
          authority: "ΚΕΕΕ — Ministero dello Sviluppo (GR)",
          id: `${registryCompany.arGemi}`,
        },
      };
    }

    if (resolution.state === "DOCUMENT_FOUND" && resolution.documents.length) {
      const documents: FinancialDocumentRef[] = resolution.documents.map((document) => {
        const ref: FinancialDocumentRef = {
          label: document.label,
          viewerUrl: document.viewerUrl,
          downloadUrl: document.downloadUrl,
          fileName: document.fileName,
        };
        if (document.year) ref.year = document.year;
        if (document.filedAt) ref.filedAt = document.filedAt;
        if (document.format) ref.format = document.format;
        return ref;
      });
      const primary = documents[0]!;

      response.financials = {
        ...(response.financials ?? { available: false, years: [] }),
        documents,
        documentUrl: primary.viewerUrl,
        documentTitle: primary.year
          ? `Bilancio ${primary.year} — documento ufficiale ΓΕΜΗ`
          : primary.label,
        source: "ΓΕΜΗ — Registro generale del commercio",
        note: "Documento ufficiale greco scaricato dal server dell'Osservatorio e servito da questa pagina: si apre qui e si scarica con un clic.",
      };
      response.officialPage = undefined;
      return response;
    }

    response.financials = {
      ...(response.financials ?? { available: false, years: [] }),
      restriction: resolution.state,
      note:
        resolution.detail ??
        "Bilancio non recuperabile automaticamente dal registro greco in questo momento.",
    };
    return response;
  } catch {
    return response;
  } finally {
    clearTimeout(timer);
  }
}
