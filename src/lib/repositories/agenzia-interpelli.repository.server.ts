/**
 * Repository server-side dell'archivio interpelli.
 *
 * Modalità iniziale: MANUAL_IMPORT con dati dimostrativi, perché la fonte
 * ufficiale può applicare protezioni anti-automazione o modificare il markup.
 *
 * Pipeline futura (nessuna pubblicazione automatica):
 * fetch server-side con allowlist agenziaentrate.gov.it -> timeout ->
 * ETag/Last-Modified -> estrazione dei soli metadati e URL -> deduplicazione per
 * numero, data, URL e hash -> bozza editoriale -> approvazione umana -> pubblicazione.
 */
import { DEMO_INTERPELLI } from "../domain/interpelli.demo";
import {
  INTERPELLI_ALLOWED_HOST,
  type InterpelloAcquisitionMode,
  type InterpelloArchive,
  type InterpelloRecord,
  type InterpelloRepository,
  type OfficialSourceAdapter,
} from "../domain/interpelli";
import { INTERPELLI_FLAGS } from "../platform/feature-flags";
import {
  CircuitBreaker,
  audit,
  newCorrelationId,
  retryIdempotent,
  withTimeout,
} from "../platform/resilience.server";

const ACQUISITION_MODE: InterpelloAcquisitionMode = INTERPELLI_FLAGS.acquisitionMode;
const breaker = new CircuitBreaker();

/** Protezione SSRF: sono ammessi soltanto documenti del dominio ufficiale. */
export function isAllowedSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === INTERPELLI_ALLOWED_HOST ||
        url.hostname === "agenziaentrate.gov.it")
    );
  } catch {
    return false;
  }
}

/** Deduplicazione per numero, data e URL (l'hash sarà aggiunto in acquisizione). */
function dedupe(records: InterpelloRecord[]): InterpelloRecord[] {
  const seen = new Set<string>();
  return records.filter((item) => {
    const key = `${item.number}|${item.publicationDate}|${item.officialUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rate limit in-memory: nessun dettaglio tecnico è esposto all'interfaccia. */
const RATE_LIMIT = { max: 120, windowMs: 60_000 };
let windowStart = Date.now();
let calls = 0;

function withinRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT.windowMs) {
    windowStart = now;
    calls = 0;
  }
  calls += 1;
  return calls <= RATE_LIMIT.max;
}

/** Solo i record approvati sono consultabili: bozze e revisioni restano escluse. */
function publicRecords(): InterpelloRecord[] {
  return dedupe(DEMO_INTERPELLI).filter((item) =>
    ["PUBLISHED", "STALE", "ARCHIVED"].includes(item.workflowStatus),
  );
}

export async function listInterpelliArchive(): Promise<InterpelloArchive> {
  const correlationId = newCorrelationId();
  const records = publicRecords();
  const availableYears = [...new Set(records.map((item) => item.year))].sort(
    (a, b) => b - a,
  );
  const lastVerifiedAt = records
    .map((item) => item.lastVerifiedAt)
    .sort()
    .at(-1)!;

  const base: InterpelloArchive = {
    correlationId,
    serviceStatus: "OK",
    message: "",
    acquisitionMode: ACQUISITION_MODE,
    lastVerifiedAt,
    records,
    availableYears,
  };

  // Servizio degradato: l'archivio già pubblicato resta comunque disponibile.
  if (!withinRateLimit() || !breaker.canPass()) {
    audit({
      correlationId,
      action: "interpelli.list",
      actorRole: "USER",
      at: new Date().toISOString(),
      outcome: "DENIED",
      detail: "limite di richieste o circuito aperto",
    });
    return {
      ...base,
      serviceStatus: "DEGRADED",
      message:
        "Il servizio di consultazione è momentaneamente in modalità ridotta. L'archivio già pubblicato resta disponibile: riprova tra qualche istante.",
    };
  }

  const loaded = await withTimeout(async () =>
    retryIdempotent(async () => {
      breaker.recordSuccess();
      return records;
    }),
  );

  const stale =
    ACQUISITION_MODE === "MANUAL_IMPORT" ||
    loaded.some((item) => item.workflowStatus === "STALE");

  audit({
    correlationId,
    action: "interpelli.list",
    actorRole: "USER",
    at: new Date().toISOString(),
    outcome: "OK",
    detail: `${loaded.length} record`,
  });

  return {
    ...base,
    records: loaded,
    serviceStatus: stale ? "STALE" : "OK",
    message: stale
      ? "Archivio in attesa di una nuova verifica della fonte ufficiale: i contenuti già pubblicati restano consultabili."
      : "",
  };
}

export async function getInterpelloById(id: string): Promise<InterpelloRecord | null> {
  return publicRecords().find((item) => item.id === id) ?? null;
}

/** Adapter isolato: in MANUAL_IMPORT non esegue alcuna richiesta di rete. */
export const officialSourceAdapter: OfficialSourceAdapter = {
  mode: ACQUISITION_MODE,
  allowedHost: INTERPELLI_ALLOWED_HOST,
  isAllowedSourceUrl,
  async collectDrafts() {
    if (ACQUISITION_MODE !== "HTML_WATCH") return [];
    // Acquisizione non attiva in questo prototipo: la pipeline produrrà solo bozze.
    return [];
  },
};

export const mockInterpelloRepository: InterpelloRepository = {
  acquisitionMode: ACQUISITION_MODE,
  listArchive: listInterpelliArchive,
  getById: getInterpelloById,
};

export const agenziaInterpelliRepository = mockInterpelloRepository;
