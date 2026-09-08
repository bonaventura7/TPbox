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

export type DocumentAvailability = "REGISTRY_ONLY" | "DOCUMENT_FOUND" | "DOCUMENT_DOWNLOADABLE";

export type RestrictionCode =
  | "CAPTCHA_REQUIRED"
  | "AUTH_REQUIRED"
  | "SESSION_BOUND"
  | "SOURCE_RESTRICTION"
  | "RATE_LIMITED"
  | "SOURCE_UNAVAILABLE"
  | "INVALID_DOCUMENT";

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
   * Stato esplicito della disponibilità documentale:
   * REGISTRY_ONLY (solo consultazione), DOCUMENT_FOUND (riferimento noto),
   * DOCUMENT_DOWNLOADABLE (scaricabile da endpoint interno TPBox).
   */
  availability?: DocumentAvailability | undefined;
  /** Motivo per cui il download automatico non è possibile. */
  restriction?: RestrictionCode | undefined;
  /** Elenco dei bilanci individuati, senza URL o token della fonte. */
  documents?: FinancialDocumentSummary[] | undefined;
}

/** Vista client di un documento: nessun URL, cookie o token del registro. */
export interface FinancialDocumentSummary {
  id: string;
  year?: number | undefined;
  kind: "ANNUAL_REPORT" | "BALANCE_SHEET" | "AUDIT_REPORT" | "OTHER";
  format: "pdf" | "xbrl" | "xml" | "zip" | "html" | "unknown";
  availability: DocumentAvailability;
  restriction?: RestrictionCode | undefined;
  title?: string | undefined;
  /** Endpoint interno, presente solo se DOCUMENT_DOWNLOADABLE. */
  downloadUrl?: string | undefined;
}

/**
 * Pagina ufficiale del registro da caricare nel browser dell'utente quando la
 * fonte non è raggiungibile da un server. Vedi `official-pages.ts`.
 */
export interface OfficialPageRef {
  url: string;
  label: string;
  note: string;
  mode?: "embed" | "external" | undefined;
  instructions?: string[] | undefined;
  actionLabel?: string | undefined;
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
