// ---------- Tipi condivisi tra API e frontend ----------

export type Iso2 = string;

export interface CountryInfo {
  iso: Iso2;
  nameIt: string;
  flag: string;
  vatPrefix: string;
  /** Registro ufficiale delle imprese */
  registryName: string;
  registryAuthority: string;
  /** Disponibilità dei bilanci tramite fonte/API gratuita */
  financials: {
    free: boolean;
    note: string;
  };
}

export interface SourceStatus {
  id: string;
  label: string;
  /** ok = dato restituito; failed = consultata con errore; skipped = non consultata */
  state: "ok" | "failed" | "skipped";
  detail?: string | undefined;
  ms?: number | undefined;
}

export interface VatInfo {
  number: string;
  country: Iso2;
  valid: boolean | null;
  checkedAt?: string | undefined;
}

export interface Identifier {
  key: string;
  value: string;
}

export interface Officer {
  role: string;
  name?: string | undefined;
  since?: string | undefined;
}

export interface ActivityCode {
  code: string;
  label?: string | undefined;
}

export interface CompanyProfile {
  name?: string | undefined;
  nameSource?: string | undefined;
  vat?: VatInfo | undefined;
  country: CountryInfo;
  registry?: { name: string | undefined; authority: string; id?: string } | undefined;
  legalForm?: string | undefined;
  status?: string | undefined;
  statusRaw?: string | undefined;
  registeredSince?: string | undefined;
  lastRegistryUpdate?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  email?: string | undefined;
  capital?: string | undefined;
  employees?: number | undefined;
  activityCodes?: ActivityCode[] | undefined;
  officers?: Officer[] | undefined;
  identifiers?: Identifier[] | undefined;
}

export interface FinancialYear {
  periodLabel: string;
  revenue?: number | undefined;
  operatingProfit?: number | undefined;
  ebitda?: number | undefined;
  netIncome?: number | undefined;
  totalAssets?: number | undefined;
  equity?: number | undefined;
  /** Totaal passiva (NL KVK): patrimonio + passività, quando l'azienda
   *  deposita il bilancio in forma abbreviata (micro-impresa). */
  liabilitiesAndEquity?: number | undefined;
  currency: string;
}

/**
 * Un documento ufficiale depositato (bilancio, allegato, iXBRL).
 * Entrambi gli URL sono SEMPRE stessa origine: il browser dell'utente non
 * contatta il registro, il file lo scarica il server dell'Osservatorio.
 */
export interface FinancialDocumentRef {
  /** Etichetta leggibile (oggetto del deposito). */
  label: string;
  /** Esercizio di riferimento, quando dichiarato dal registro. */
  year?: string | undefined;
  /** Data di deposito/pubblicazione, come pubblicata dal registro. */
  filedAt?: string | undefined;
  /** PDF / XLSX / XBRL / iXBRL — dedotto dal documento, mai presunto. */
  format?: string | undefined;
  /** Tipo di documento dichiarato dal registro (Bilancio, Atto depositato, …). */
  kind?: string | undefined;
  /** true solo se il registro indica che è una pubblicazione di conti annuali. */
  financial?: boolean | undefined;
  /** Nome file proposto per il download. */
  fileName?: string | undefined;
  /** Apre il documento nel riquadro della scheda (inline). */
  viewerUrl: string;
  /** Scarica il documento con un clic (attachment). */
  downloadUrl: string;
}

export interface Financials {
  available: boolean;
  currency?: string | undefined;
  years: FinancialYear[];
  source?: string | undefined;
  note?: string | undefined;
  /**
   * URL del documento ufficiale (PDF/XBRL) servita dal proxy in-page
   * del tool (es. /api/company-finder/document?url=...). L'utente resta
   * sul sito: nessun reindirizzamento esterno.
   */
  documentUrl?: string | undefined;
  /** Nome del documento (es. "Jahresabschluss 2024 — Siemens AG") */
  documentTitle?: string | undefined;
  /**
   * Tutti i documenti depositati (più esercizi, più formati). Quando è
   * presente, la scheda mostra l'elenco con download a un clic.
   */
  documents?: FinancialDocumentRef[] | undefined;
  /** Motivo tecnico quando il documento non è disponibile (es. NO_KEY). */
  restriction?: string | undefined;
  /** Da dove arriva il documento ("Registro ΓΕΜΗ (API aperta)", "Link fornito"). */
  documentChannel?: string | undefined;
}

/**
 * Pagina ufficiale del registro da caricare nel browser dell'utente quando la
 * fonte non è raggiungibile da un server. Vedi `official-pages.ts`.
 */
export interface OfficialPageRef {
  url: string;
  label: string;
  note: string;
}

export interface SearchResponse {
  found: boolean;
  company?: CompanyProfile | undefined;
  financials?: Financials | undefined;
  sources: SourceStatus[];
  warnings: string[];
  searchedAt: string;
  /** Consultazione ufficiale incorporata: usata quando il documento non è estraibile lato server. */
  officialPage?: OfficialPageRef | undefined;
}

export interface SearchRequest {
  query: string;
  vat: string;
  country: Iso2 | "";
}
