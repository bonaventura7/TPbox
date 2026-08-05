/**
 * Modello di dominio del Portale interpelli.
 * Unica fonte pubblica prevista: Agenzia delle Entrate - Risposte agli interpelli.
 * Tutti i record del prototipo sono sintetici e marcati come demo.
 */

/** Dominio unico ammesso in allowlist per l'acquisizione futura (solo server-side). */
export const INTERPELLI_ALLOWED_HOST = "www.agenziaentrate.gov.it";

export const INTERPELLI_SOURCE_URL =
  "https://www.agenziaentrate.gov.it/portale/normativa-e-prassi/risposte-agli-interpelli";

export const INTERPELLO_SUBJECTS = [
  {
    id: "reddito-impresa",
    label: "Reddito d'impresa e IRAP",
    subSubjects: [
      "Determinazione della base imponibile",
      "Operazioni straordinarie",
      "Consolidato e trasparenza",
      "Fiscalità internazionale",
      "Principio di derivazione e competenza",
      "IRAP",
    ],
  },
  {
    id: "agevolazioni",
    label: "Agevolazioni fiscali",
    subSubjects: [
      "Patent box",
      "Ricerca e sviluppo",
      "Investimenti in beni strumentali",
      "ACE",
      "Altre agevolazioni",
    ],
  },
  {
    id: "iva-indirette",
    label: "IVA e imposte indirette",
    subSubjects: [
      "Operazioni con l'estero",
      "Presupposti dell'imposta",
      "Aliquote",
      "Regimi speciali",
      "Adempimenti",
      "Fatturazione elettronica",
    ],
  },
  {
    id: "lavoro-dipendente",
    label: "Reddito di lavoro dipendente",
    subSubjects: [
      "Mobilità internazionale dei lavoratori",
      "Regimi agevolativi per impatriati",
      "Welfare aziendale",
    ],
  },
  {
    id: "internazionale-tp",
    label: "Fiscalità internazionale e transfer pricing",
    subSubjects: [
      "Transfer pricing",
      "Stabile organizzazione",
      "Residenza fiscale",
      "Convenzioni contro le doppie imposizioni",
      "Ritenute transfrontaliere",
      "CFC",
      "Branch exemption",
    ],
  },
  {
    id: "altri-redditi",
    label: "Altre categorie di reddito",
    subSubjects: [],
  },
  {
    id: "adempimenti",
    label: "Adempimenti e procedure",
    subSubjects: [],
  },
] as const;

export type InterpelloSubjectId = (typeof INTERPELLO_SUBJECTS)[number]["id"];
export type InterpelloSubject = (typeof INTERPELLO_SUBJECTS)[number];

export function subjectLabel(id: InterpelloSubjectId): string {
  return INTERPELLO_SUBJECTS.find((item) => item.id === id)?.label ?? id;
}

/** Materie considerate rilevanti per transfer pricing e fiscalità internazionale. */
export const INTERNATIONAL_SUBJECT_IDS: InterpelloSubjectId[] = ["internazionale-tp"];

export const TP_SUB_SUBJECTS = [
  "Transfer pricing",
  "Stabile organizzazione",
  "Convenzioni contro le doppie imposizioni",
  "Ritenute transfrontaliere",
  "CFC",
  "Branch exemption",
  "Fiscalità internazionale",
] as const;

/** Stato editoriale del record: nessuna acquisizione può pubblicare automaticamente. */
export type InterpelloWorkflowStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "PUBLISHED"
  | "STALE"
  | "ARCHIVED";

/** Modalità di acquisizione previste per l'adapter server-side. */
export type InterpelloAcquisitionMode = "HTML_WATCH" | "MANUAL_IMPORT" | "DISABLED";

export interface InterpelloRecord {
  id: string;
  /** Numero della risposta, nella forma "numero/anno". */
  number: string;
  publicationDate: string;
  year: number;
  title: string;
  abstract: string;
  subject: InterpelloSubjectId;
  subSubject: string | null;
  tags: string[];
  legalReferences: string[];
  /** Documento o pagina sul dominio ufficiale dell'Agenzia delle Entrate. */
  officialUrl: string;
  sourceName: "Agenzia delle Entrate";
  sourceType: "ISTITUZIONALE";
  lastVerifiedAt: string;
  workflowStatus: InterpelloWorkflowStatus;
  /** Contenuti redazionali sintetici usati nella vista di dettaglio. */
  question: string;
  answerSummary: string;
  relatedTopics: string[];
  isDemo: true;
}

export type InterpelloSort = "RECENT_FIRST" | "OLDEST_FIRST";

export type InterpelloServiceStatus = "OK" | "STALE" | "DEGRADED" | "ERROR";

export interface InterpelloArchive {
  correlationId: string;
  serviceStatus: InterpelloServiceStatus;
  message: string;
  acquisitionMode: InterpelloAcquisitionMode;
  lastVerifiedAt: string;
  records: InterpelloRecord[];
  availableYears: number[];
}

/** Contratto dell'archivio: implementato dal mock e, in futuro, dalla fonte ufficiale. */
export interface InterpelloRepository {
  acquisitionMode: InterpelloAcquisitionMode;
  listArchive(): Promise<InterpelloArchive>;
  getById(id: string): Promise<InterpelloRecord | null>;
}

/**
 * Adapter per l'acquisizione futura dalla fonte ufficiale.
 * Pipeline obbligatoria: fetch con allowlist agenziaentrate.gov.it -> timeout ->
 * ETag/Last-Modified -> estrazione dei soli metadati e URL -> deduplicazione per
 * numero, data, URL e hash -> bozza editoriale -> approvazione umana -> pubblicazione.
 */
export interface OfficialSourceAdapter {
  mode: InterpelloAcquisitionMode;
  allowedHost: string;
  isAllowedSourceUrl(url: string): boolean;
  /** Restituisce sempre bozze: la pubblicazione richiede approvazione umana. */
  collectDrafts(): Promise<InterpelloRecord[]>;
}

export function isTransferPricingRecord(item: InterpelloRecord): boolean {
  if (INTERNATIONAL_SUBJECT_IDS.includes(item.subject)) return true;
  return (
    item.subSubject !== null &&
    (TP_SUB_SUBJECTS as readonly string[]).includes(item.subSubject)
  );
}
