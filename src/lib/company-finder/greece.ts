// ---------- Identificativi greci: ΓΕΜΗ e ΑΦΜ ----------
//
// Due numeri diversi che vengono confusi di continuo, e la confusione è la
// ragione per cui la Grecia non funzionava:
//
//  * ΑΦΜ (partita IVA) — 9 cifre, con cifra di controllo. Prefisso IVA "EL".
//  * Αριθμός ΓΕΜΗ — 12 cifre nella forma canonica usata dalle API
//    (`companyId=178892854000`); il portale pubblico tollera la stessa
//    scrittura senza gli zeri iniziali (`/company/1797901000`).
//
// Regola verificata sui documenti ufficiali: il ΓΕΜΗ a 12 cifre termina con
// "000" per la sede principale (178892854000, 156478806000, 000223001000).
// Un input di 9 cifre è quindi SEMPRE un ΑΦΜ, mai un ΓΕΜΗ.

/** Pesi della cifra di controllo dell'ΑΦΜ (2^8 … 2^1 sulle prime 8 cifre). */
const VAT_WEIGHTS = [256, 128, 64, 32, 16, 8, 4, 2] as const;

/**
 * Normalizza e VALIDA una partita IVA greca.
 * Accetta "EL802575874", "el 802.575.874", "802575874".
 * Ritorna undefined se il formato o la cifra di controllo non tornano: meglio
 * nessun dato che un'identità sbagliata.
 */
export function normalizeGreekVat(value: string): string | undefined {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/^(EL|GR)\s*/, "")
    .replace(/\D/g, "");
  if (compact.length !== 9) return undefined;

  let sum = 0;
  for (let index = 0; index < VAT_WEIGHTS.length; index += 1) {
    sum += Number(compact[index]) * VAT_WEIGHTS[index]!;
  }
  const check = (sum % 11) % 10;
  if (check !== Number(compact[8])) return undefined;
  return compact;
}

export interface GreekRegistryIds {
  /** ΓΕΜΗ senza zeri iniziali: forma usata negli URL pubblici del portale. */
  gemi: string;
  /** ΓΕΜΗ a 12 cifre: forma usata dalle API e dal parametro `companyId`. */
  arGemi: string;
}

/**
 * Normalizza un numero ΓΕΜΗ. Accetta 10-12 cifre (gli zeri iniziali vengono
 * spesso persi nei copia-incolla); rifiuta 9 cifre, che sono un ΑΦΜ.
 */
export function normalizeGemi(value: string): GreekRegistryIds | undefined {
  const digits = value.trim().replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 12) return undefined;

  const compact = digits.replace(/^0+(?=\d)/, "");
  if (compact.length < 10 || compact.length > 12) return undefined;

  return { gemi: compact, arGemi: compact.padStart(12, "0") };
}

/**
 * Estrae il ΓΕΜΗ da un input libero: accetta il numero nudo, le forme
 * "ΓΕΜΗ: 178892854000" / "GEMI 178892854000" e lo recupera anche dal testo di
 * un documento ufficiale ("ΑΡΙΘΜΟΣ ΓΕΜΗ:178892854000").
 */
export function extractGemiFromText(value: string): GreekRegistryIds | undefined {
  const match =
    value.match(/(?:ΓΕΜΗ|Γ\.Ε\.Μ\.Η|GEMI)\D{0,6}(\d{10,12})/i) ?? value.match(/\b(\d{10,12})\b/);
  return match?.[1] ? normalizeGemi(match[1]) : undefined;
}

/** Host ufficiali da cui proviene un documento societario greco. */
export const GREEK_DOCUMENT_HOSTS = [
  "publicity.businessportal.gr",
  "filings.businessportal.gr",
] as const;

const DOWNLOAD_PATH_RE = /^\/api\/download\/[A-Za-z][A-Za-z0-9_-]*\/\d+$/i;
const IXBRL_PATH_RE = /^\/ixbrl\/[^\s/]+_ixbrlview\.html$/i;

/**
 * Un link è utilizzabile solo se punta a un documento del registro greco.
 * È il filtro che protegge la funzione "allega il documento ufficiale":
 * l'utente può incollare un link, il server non lo inoltra alla cieca.
 */
export function isGreekDocumentUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!(GREEK_DOCUMENT_HOSTS as readonly string[]).includes(url.hostname.toLowerCase()))
    return false;
  return DOWNLOAD_PATH_RE.test(url.pathname) || IXBRL_PATH_RE.test(url.pathname);
}

/**
 * Famiglie di documenti servite dal portale pubblico come
 * `/api/download/<famiglia>/<id>?companyId=<ΓΕΜΗ>`.
 *
 * Rilevate leggendo il codice della pagina società del portale
 * (`/company/[arGEMI]`): le sezioni "Ιστορικό Καταστατικών", "Αποφάσεις Αρχών
 * Ελέγχου Νομιμότητας", "Λοιπά Αρχεία", "FinancialStatements" e "Μεταβολές"
 * costruiscono ciascuna il proprio link con questa forma.
 */
const PORTAL_DOCUMENT_FAMILIES = {
  financial: "Bilancio",
  modifications: "Variazioni registrate",
  statutes: "Atto costitutivo / statuto",
  authority: "Decisioni delle autorità di controllo",
  rest: "Altri documenti",
} as const;

export type GreekDocumentFamily = keyof typeof PORTAL_DOCUMENT_FAMILIES;

/** Etichetta italiana della famiglia di documento. */
export function documentFamilyLabel(family: GreekDocumentFamily): string {
  return PORTAL_DOCUMENT_FAMILIES[family];
}

/** Riconosce la famiglia di un link di download del portale. */
export function greekDocumentFamily(pathname: string): GreekDocumentFamily | undefined {
  const segment = (pathname.split("/").filter(Boolean)[2] ?? "").toLowerCase();
  return (Object.keys(PORTAL_DOCUMENT_FAMILIES) as GreekDocumentFamily[]).find(
    (family) => family === segment,
  );
}

/** Costruisce l'URL di download ufficiale di un documento ΓΕΜΗ. */
export function greekDownloadUrl(kind: string, elementId: string | number, arGemi: string): string {
  const safeKind = String(kind).replace(/[^A-Za-z0-9_-]/g, "");
  const safeId = String(elementId).replace(/\D/g, "");
  if (!safeKind || !safeId) return "";
  return `https://publicity.businessportal.gr/api/download/${safeKind}/${safeId}?companyId=${encodeURIComponent(arGemi)}`;
}
