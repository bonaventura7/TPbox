// ---------- Lettura dei documenti ΓΕΜΗ ----------
//
// L'API aperta ΓΕΜΗ restituisce i documenti pubblici della società in un
// oggetto annidato (decisioni degli organi, pubblicazioni, allegati) la cui
// forma non è garantita stabile: i campi cambiano e la documentazione Swagger
// non elenca tutte le collezioni. Invece di legare il tool a uno schema che
// può cambiare, si attraversa il payload e si raccolgono TUTTI i riferimenti a
// un file (URL diretto oppure `elementId` da passare a /downloadFile), con il
// contesto testuale che serve a capire di che documento si tratta.
//
// Modulo puro: nessuna rete, collaudabile con fixture.

export interface GemiDocumentCandidate {
  /** Etichetta leggibile (tema dell'atto, oggetto, numero di registrazione). */
  label: string;
  /** Percorso JSON in cui è stato trovato, per diagnostica. */
  path: string;
  /** Collezione del registro che contiene il documento (es. "decision", "publication"). */
  collection?: string | undefined;
  /** URL del file, quando il record lo espone direttamente. */
  url?: string | undefined;
  /** Id numerico per GET /downloadFile?elementId=. */
  elementId?: string | undefined;
  /** Chiave di /downloadFile (es. "assemblyDecision"). */
  downloadKey?: string | undefined;
  /** Data associata al documento, come pubblicata dal registro. */
  date?: string | undefined;
  /** true quando il contesto indica un bilancio / conti annuali. */
  financial: boolean;
}

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asDigits(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string") {
    const digits = value.replace(/\D/g, "");
    return digits || undefined;
  }
  return undefined;
}

/** Parole che identificano una pubblicazione di conti annuali (greco + inglese). */
const FINANCIAL_MARKERS = [
  "οικονομικ",
  "οικονομικών καταστάσεων",
  "ισολογισμ",
  "χρηματοοικονομικ",
  "αποτελεσματ",
  "ισολογ",
  "financialstatement",
  "financial statement",
  "financial_statement",
  "annualaccount",
  "annual account",
  "balance sheet",
  "balancesheet",
];

/** Il contesto (percorso JSON + testi del record) parla di bilancio? */
export function mentionsFinancialStatements(...texts: (string | undefined)[]): boolean {
  const haystack = texts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  if (!haystack.trim()) return false;
  return FINANCIAL_MARKERS.some((marker) => haystack.includes(marker));
}

const LABEL_KEYS = [
  "decisionSubject",
  "summary",
  "subject",
  "title",
  "descr",
  "description",
  "documentType",
  "type",
  "kak",
  "kad",
  "fileName",
  "name",
];

const DATE_KEY_RE = /date|ημ|announced|submitted|registration/i;
const ID_KEY_RE = /^(elementId|fileId|documentId|attachmentId|id)$/i;
const URL_VALUE_RE = /^(https?:\/\/|\/api\/download\/)/i;

function labelFor(record: Dict, path: string, context: string[]): string {
  for (const key of LABEL_KEYS) {
    const value = asText(record[key]);
    if (value && value.length <= 180) return value;
  }
  const fallback = context.find((text) => text.length > 3 && text.length <= 120);
  if (fallback) return fallback;
  const leaf = path
    .split(/[.[\]]+/)
    .filter(Boolean)
    .slice(-2)
    .join(" › ");
  return leaf || "Documento ufficiale";
}

/** Anno di esercizio desunto dalla data o dall'etichetta (es. "2024"). */
export function documentYear(candidate: GemiDocumentCandidate): string | undefined {
  const fromLabel = candidate.label.match(/\b(19|20)\d{2}\b/)?.[0];
  if (fromLabel) return fromLabel;

  const raw = candidate.date;
  if (!raw) return undefined;
  const iso = raw.match(/\b(19|20)\d{2}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso.slice(0, 4);
  const greek = raw.match(/\b\d{1,2}\/\d{1,2}\/((19|20)\d{2})\b/);
  return greek?.[1];
}

function dateValue(record: Dict): string | undefined {
  const preferred = ["dateRegistrated", "dateAnnounced", "dateSubmitted", "dateAssemblyDecided"];
  for (const key of preferred) {
    const value = asText(record[key]);
    if (value) return value;
  }
  for (const [key, value] of Object.entries(record)) {
    const text = asText(value);
    if (text && DATE_KEY_RE.test(key) && /\d/.test(text)) return text;
  }
  return undefined;
}

/**
 * Raccoglie ogni riferimento a un documento presente nel payload.
 * Non inventa URL: esce solo ciò che il registro ha pubblicato.
 */
export function collectGemiDocuments(payload: unknown): GemiDocumentCandidate[] {
  const found: GemiDocumentCandidate[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 10) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }

    const record = asDict(node);
    if (!record) return;

    const context: string[] = [];
    const urls: string[] = [];
    let elementId: string | undefined;
    let downloadKey: string | undefined;

    for (const [key, value] of Object.entries(record)) {
      const text = asText(value);
      if (text) {
        if (text.length <= 400) context.push(text);
        if (URL_VALUE_RE.test(text)) urls.push(text);
      }
      if (ID_KEY_RE.test(key)) {
        const digits = asDigits(value);
        if (digits && !elementId) elementId = digits;
      }
      if (/^key$/i.test(key) && text && !downloadKey) downloadKey = text;
      walk(value, path ? `${path}.${key}` : key, depth + 1);
    }

    if (urls.length === 0 && !elementId) return;

    const label = labelFor(record, path, context);
    const date = dateValue(record);
    const financial = mentionsFinancialStatements(path, label, ...context);
    const url = urls[0];

    const fingerprint = url ?? `${downloadKey ?? ""}#${elementId ?? ""}#${path}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);

    const candidate: GemiDocumentCandidate = { label, path, financial };
    const collection = path.split(/[.[\]]+/).filter(Boolean)[0];
    if (collection) candidate.collection = collection;
    if (url) candidate.url = url;
    if (elementId) candidate.elementId = elementId;
    if (downloadKey) candidate.downloadKey = downloadKey;
    if (date) candidate.date = date;
    found.push(candidate);
  };

  walk(payload, "", 0);
  return found;
}

/** Ordina per data decrescente: il deposito più recente prima. */
export function sortByDateDesc(candidates: GemiDocumentCandidate[]): GemiDocumentCandidate[] {
  const timestamp = (candidate: GemiDocumentCandidate): number => {
    const raw = candidate.date;
    if (!raw) return 0;
    const iso = raw.match(/\b((19|20)\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const greek = raw.match(/\b(\d{1,2})\/(\d{1,2})\/((19|20)\d{2})\b/);
    if (greek) return Date.UTC(Number(greek[3]), Number(greek[2]) - 1, Number(greek[1]));
    return 0;
  };
  return [...candidates].sort((a, b) => timestamp(b) - timestamp(a));
}
