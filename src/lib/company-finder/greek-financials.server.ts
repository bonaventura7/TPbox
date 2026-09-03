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
  documentFamilyLabel,
  extractGemiFromText,
  greekDocumentFamily,
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
  type GemiApiResult,
  type GemiApiState,
  type GemiCompanySummary,
} from "./sources/gemi-opendata";

const PORTAL_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type GreekResolutionState =
  "DOCUMENT_FOUND" | "NO_IDENTIFIER" | "NO_KEY" | "NOT_FOUND" | "SOURCE_UNAVAILABLE";

/** Da dove arriva il documento: dichiarato all'utente, mai nascosto. */
export type GreekDocumentChannel = "API aperta ΓΕΜΗ" | "Scheda pubblica ΓΕΜΗ" | "Link fornito";

export interface GreekDocument {
  label: string;
  year?: string | undefined;
  filedAt?: string | undefined;
  format?: string | undefined;
  /** Tipo dichiarato dal registro (es. "Pubblicazione ΓΕΜΗ", "Bilancio"). */
  kind?: string | undefined;
  /** true solo se il registro stesso indica una pubblicazione di conti annuali. */
  financial: boolean;
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
  /** Canale che ha prodotto i documenti. */
  channel?: GreekDocumentChannel | undefined;
  /** Motivo leggibile quando non c'è documento: finisce nella UI. */
  detail?: string | undefined;
  apiState?: GemiApiState | undefined;
}

export interface GreekSearchInput {
  gemi?: GreekRegistryIds | undefined;
  vat?: string | undefined;
  name?: string | undefined;
}

/**
 * Come il registro chiama la collezione in cui il documento è pubblicato.
 * Serve a non spacciare per "bilancio" un atto che bilancio non è.
 */
const COLLECTION_LABELS: Record<string, string> = {
  decision: "Atto depositato (decisione organo)",
  publication: "Pubblicazione ΓΕΜΗ (ΥΜΣ)",
  financial: "Bilancio",
  financialstatements: "Bilancio",
  financialstatement: "Bilancio",
  balance: "Bilancio",
  accounts: "Bilancio",
  statutes: "Atto costitutivo / statuto",
  authority: "Decisione autorità di controllo",
  rest: "Altro documento",
  attachments: "Allegato alla pubblicazione",
};

function collectionKind(collection: string | undefined): string | undefined {
  if (!collection) return undefined;
  const key = collection.toLowerCase().replace(/[^a-z]/g, "");
  return COLLECTION_LABELS[key];
}

function toGreekDocument(
  label: string,
  sourceUrl: string,
  extras: {
    year?: string | undefined;
    filedAt?: string | undefined;
    kind?: string | undefined;
    financial?: boolean | undefined;
  } = {},
): GreekDocument | undefined {
  if (!sourceUrl) return undefined;
  const fileName = safeFileName(
    label.match(/[^\s/\\]+\.(pdf|xls|xlsx|xml|xhtml|zip)/i)?.[0] ?? label,
    "documento-grecia",
  );
  const document: GreekDocument = {
    label: label.slice(0, 180),
    fileName,
    financial: Boolean(extras.financial),
    sourceUrl,
    viewerUrl: documentViewerUrl(sourceUrl),
    downloadUrl: documentDownloadUrl(sourceUrl, fileName),
  };
  const format = documentFormat(label, sourceUrl);
  if (format) document.format = format;
  if (extras.year) document.year = extras.year;
  if (extras.filedAt) document.filedAt = extras.filedAt;
  if (extras.kind) document.kind = extras.kind;
  return document;
}

/**
 * Un candidato dell'API aperta diventa un documento servibile dal proxy.
 *
 * Due soli casi, entrambi "il registro lo ha pubblicato":
 *   • il record espone già l'URL del file;
 *   • il record espone un `elementId`, che si risolve con l'endpoint
 *     documentato `/downloadFile?key=&elementId=`.
 * Non si costruisce mai un URL del portale a partire da un id dell'API aperta:
 * sono spazi di identificatori diversi e l'utente riceverebbe un 404.
 */
function candidateToDocument(candidate: GemiDocumentCandidate): GreekDocument | undefined {
  const year = documentYear(candidate);
  const extras = {
    year,
    filedAt: candidate.date,
    kind: collectionKind(candidate.collection),
    financial: candidate.financial,
  };

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
    const viaApi = gemiDownloadFileUrl(
      candidate.downloadKey ?? "assemblyDecision",
      candidate.elementId,
    );
    if (viaApi) return toGreekDocument(candidate.label, viaApi, extras);
  }

  return undefined;
}

/**
 * Cache TTL del payload documenti: la chiave ΓΕΜΗ ha limiti di frequenza
 * (soprattutto quella tecnica di documentazione) e la stessa società viene
 * cercata più volte nella stessa sessione. Dieci minuti, in memoria di
 * funzione serverless: niente persistenza, niente dati personali.
 */
const DOCUMENTS_TTL_MS = 10 * 60 * 1000;
const DOCUMENTS_CACHE_MAX = 200;
const documentsCache = new Map<string, { at: number; payload: unknown }>();

function cachedGemiDocuments(arGemi: string): { at: number; payload: unknown } | undefined {
  const hit = documentsCache.get(arGemi);
  if (!hit) return undefined;
  if (Date.now() - hit.at > DOCUMENTS_TTL_MS) {
    documentsCache.delete(arGemi);
    return undefined;
  }
  return hit;
}

function rememberGemiDocuments(arGemi: string, payload: unknown): void {
  if (documentsCache.size >= DOCUMENTS_CACHE_MAX) {
    const oldest = documentsCache.keys().next().value;
    if (oldest) documentsCache.delete(oldest);
  }
  documentsCache.set(arGemi, { at: Date.now(), payload });
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
 * Formato e nome reali del file, letti dagli header della risposta.
 *
 * Serve perché gli URL del registro non contengono l'estensione: il caso reale
 * (ARGI CORPORATION, `/api/download/financial/2150556`) risponde con un file
 * `.xls` — in realtà una tabella HTML — che in un iframe sarebbe illeggibile.
 * Una HEAD (o, se non è ammessa, un GET con Range) basta a saperlo prima di
 * costruire la scheda. Non è un canale alternativo: stesso host, stesso file.
 */
async function probeDocumentMeta(
  url: string,
): Promise<{ format?: string | undefined; fileName?: string | undefined }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  const read = (response: Response): { format?: string; fileName?: string } => {
    const disposition = response.headers.get("content-disposition") ?? "";
    const declared =
      disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1]?.trim() || undefined;
    const fileName = declared ? safeFileName(decodeURIComponent(declared)) : undefined;
    const format = documentFormat(response.headers.get("content-type") ?? "", declared);
    const meta: { format?: string; fileName?: string } = {};
    if (format) meta.format = format;
    if (fileName) meta.fileName = fileName;
    return meta;
  };

  try {
    const head = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": PORTAL_UA },
      signal: controller.signal,
    }).catch(() => undefined);
    if (head?.ok) {
      const meta = read(head);
      if (meta.format || meta.fileName) return meta;
    }
    const ranged = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": PORTAL_UA, Range: "bytes=0-0" },
      signal: controller.signal,
    }).catch(() => undefined);
    if (ranged && (ranged.ok || ranged.status === 206)) return read(ranged);
    return {};
  } finally {
    clearTimeout(timer);
  }
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
      const cached = cachedGemiDocuments(arGemi);
      const raw: GemiApiResult<unknown> = cached
        ? { ok: true, state: "OK", data: cached.payload }
        : await getGemiDocumentsRaw(arGemi, controller.signal);
      if (raw.ok) {
        if (!cached) rememberGemiDocuments(arGemi, raw.data);
        const candidates = collectGemiDocuments(raw.data);
        const financial = candidates.filter((candidate) => candidate.financial);
        const chosen = sortByDateDesc(financial.length ? financial : candidates);
        const documents = chosen
          .map((candidate) => candidateToDocument(candidate))
          .filter((doc): doc is GreekDocument => Boolean(doc))
          .slice(0, 8);

        if (!company) {
          const search = await searchGemiCompanies({ arGemi }, controller.signal);
          if (search.ok) company = search.data?.[0];
        }

        if (documents.length) {
          const result: GreekResolution = {
            state: "DOCUMENT_FOUND",
            documents,
            channel: "API aperta ΓΕΜΗ",
          };
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
      .map((link, index) => {
        let pathname = "";
        try {
          pathname = new URL(link).pathname;
        } catch {
          return undefined;
        }
        const family = greekDocumentFamily(pathname);
        const kind = family ? documentFamilyLabel(family) : undefined;
        const label = kind
          ? `${kind}${portalLinks.length > 1 ? ` (${index + 1})` : ""}`
          : `Documento ufficiale depositato${portalLinks.length > 1 ? ` (${index + 1})` : ""}`;
        return toGreekDocument(label, link, { kind, financial: family === "financial" });
      })
      .filter((doc): doc is GreekDocument => Boolean(doc));

    if (portalDocuments.length) {
      const result: GreekResolution = {
        state: "DOCUMENT_FOUND",
        documents: portalDocuments,
        channel: "Scheda pubblica ΓΕΜΗ",
      };
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
    const attached = new URL(attachedDocumentUrl);
    const fileName = decodeURIComponent(attached.pathname.split("/").pop() ?? "documento");
    const family = greekDocumentFamily(attached.pathname);
    const kind = family ? documentFamilyLabel(family) : undefined;
    const label = kind
      ? `${kind} — ΓΕΜΗ ${gemi?.arGemi ?? identifier}`
      : `Documento ufficiale — ΓΕΜΗ ${gemi?.arGemi ?? identifier}`;
    const document: FinancialDocumentRef = {
      label,
      fileName,
      viewerUrl: documentViewerUrl(attachedDocumentUrl),
      downloadUrl: documentDownloadUrl(attachedDocumentUrl, fileName),
    };
    const format = documentFormat(label, attachedDocumentUrl);
    if (format) document.format = format;
    if (kind) document.kind = kind;
    if (family === "financial") document.financial = true;
    response.financials = {
      ...(response.financials ?? { available: false, years: [] }),
      documents: [document],
      documentUrl: document.viewerUrl,
      documentTitle: label,
      documentChannel: "Link fornito",
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
          financial: document.financial,
        };
        if (document.year) ref.year = document.year;
        if (document.filedAt) ref.filedAt = document.filedAt;
        if (document.format) ref.format = document.format;
        if (document.kind) ref.kind = document.kind;
        return ref;
      });
      const primary = documents[0]!;
      const primarySource = resolution.documents[0]!;

      // Formato vero del documento principale: decide se mostrarlo in pagina o
      // proporre solo il download. Fallisce in silenzio: non blocca la scheda.
      if (!primary.format) {
        const meta: { format?: string | undefined; fileName?: string | undefined } =
          await probeDocumentMeta(primarySource.sourceUrl).catch(() => ({}));
        if (meta.format) primary.format = meta.format;
        // Se il nome che avevamo non è un vero nome di file (l'etichetta greca
        // non ha estensione), vale quello dichiarato dal registro.
        const looksLikeFileName = /\.(pdf|xls|xlsx|xml|xhtml|zip|htm|html)$/i.test(
          primary.fileName ?? "",
        );
        if (meta.fileName && !looksLikeFileName) {
          primary.fileName = meta.fileName;
          primary.downloadUrl = documentDownloadUrl(primarySource.sourceUrl, meta.fileName);
        }
      }

      // Il titolo dice ciò che il registro ha davvero pubblicato: "bilancio"
      // solo quando il registro lo indica come pubblicazione di conti annuali.
      const title = primarySource.financial
        ? primary.year
          ? `Bilancio ${primary.year} — documento ufficiale ΓΕΜΗ`
          : `Bilancio — documento ufficiale ΓΕΜΗ`
        : `${primary.label}${primarySource.kind ? ` (${primarySource.kind})` : ""}`;

      response.financials = {
        ...(response.financials ?? { available: false, years: [] }),
        documents,
        documentUrl: primary.viewerUrl,
        documentTitle: title,
        documentChannel: resolution.channel,
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
