// ---------- Orchestratore della ricerca ("regia" multi-registro) ----------
// Flusso: input (nome + IVA + paese) → risolve il paese dal prefisso VIES o
// dalla selezione → consulta IN PARALLELO le fonti ufficiali del paese
// (tabella REGISTRY_ROUTES) + VIES + OpenCorporates → unifica i dati →
// scheda impresa + stato di ogni fonte consultata.
//
// Tutto lato server: l'utente finale NON viene reindirizzato su alcun sito
// esterno; ogni fonte è richiamata direttamente da questa applicazione.

import { getCountry } from "./countries";
import { checkVat } from "./sources/vies";
import { fetchKrsOdpis } from "./sources/krs";
import { lookupNip } from "./sources/bialalistavat";
import { fetchCvr } from "./sources/cvr";
import { searchAres } from "./sources/ares-cz";
import { searchBrreg } from "./sources/brreg-no";
import { searchYtj } from "./sources/ytj-fi";
import { searchInpi, sirenFromVat } from "./sources/inpi-fr";
import { searchBg } from "./sources/registry-bg";
// ---- layer BILANCI (fonti gratuite, lato server) ----
import { fetchKvkJaarrekeningen, kvkFromInput } from "./sources/bilanci/kvk-nl";
import { searchUrAccounting } from "./sources/bilanci/ur-de";
import { fetchPappersFinancials } from "./sources/bilanci/pappers-fr";
import { fetchDkRegnskaber, cvrFromVat } from "./sources/bilanci/regnskaber-dk";
import { fetchCbsoAccounts, cbeFromInput } from "./sources/bilanci/cbso-be";
import { fetchKrsRdfDocuments, krsFromPlInput } from "./sources/bilanci/krs-rdf-pl";
import { numericRegistryId, searchGleif } from "./sources/gleif";
import type { GleifMatch } from "./sources/gleif";
import { searchByName as ocSearch } from "./sources/open-corporates";
import { lookupCompany as chLookup } from "./sources/companies-house";
import type {
  CompanyProfile,
  Financials,
  SearchRequest,
  SearchResponse,
  SourceStatus,
} from "./types";

// Le chiavi sono tutte facoltative. Lettura difensiva: su runtime edge
// `process` puo' non esistere, e in quel caso il tool deve degradare
// (fonti senza chiave restano attive) invece di sollevare al primo import.
const ENV: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const OC_KEY = ENV["OPEN_CORPORATES_API_KEY"];
const CH_KEY = ENV["COMPANIES_HOUSE_API_KEY"];
const INPI_KEY = ENV["INPI_KEY"];
const PAPPERS_KEY = ENV["PAPPERS_API_KEY"];
const NBB_CBSO_KEY = ENV["NBB_CBSO_API_KEY"];
const NBB_CBSO_BASE = ENV["NBB_CBSO_BASE"]; // es. https://ws.uat2.cbso.nbb.be (test, chiave gratuita)

interface Job {
  status: SourceStatus;
  profile?: () => CompanyProfile | undefined;
  fin?: () => Financials | undefined;
  run: () => Promise<void>;
}

function makeJob(
  id: string,
  label: string,
  run: (job: Job, s: SourceStatus) => Promise<void>,
): Job {
  const status: SourceStatus = { id, label, state: "skipped" };
  const job: Job = { status, run: async () => run(job, status) };
  return job;
}

/** Prefisso IVA → ISO2 del catalogo (GB→UK, EL→GR). */
function prefixToIso(prefix: string): string {
  const p = prefix.toUpperCase();
  if (p === "GB") return "UK";
  if (p === "EL") return "GR";
  return p;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .toLowerCase();
}

function namesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const len = Math.max(na.length, nb.length);
  let diff = 0;
  for (let i = 0; i < len; i++) if ((na[i] ?? "") !== (nb[i] ?? "")) diff++;
  return diff / len <= 0.15;
}

function mergeProfile(
  target: CompanyProfile | undefined,
  patch: CompanyProfile | undefined,
): CompanyProfile | undefined {
  if (!patch) return target;
  if (!target) return patch;
  const merged: CompanyProfile = { ...patch };
  for (const k of Object.keys(target) as (keyof CompanyProfile)[]) {
    const v = target[k];
    if (v !== undefined && v !== null && v !== "")
      (merged as unknown as Record<string, unknown>)[k] = v;
  }
  if (patch.name && target.name) {
    merged.name = patch.name;
    merged.nameSource = patch.nameSource;
  } else if (target.name) {
    merged.name = target.name;
  }
  return merged;
}

// ============================================================================
// REGISTRY_ROUTES — tabella di regia: paese → adapter diretto del registro
// nazionale (in ordine di priorità, con fallback a VIES + OpenCorporates).
// Ogni adapter è una chiamata server-side al registro ufficiale.
// ============================================================================

interface Ctx {
  query: string;
  localVat: string;
  countryIso: string;
}

interface DirectAdapter {
  id: string;
  label: string;
  /** nome dell'input ottimale: 'name' | 'vat' */
  input: "name" | "vat" | "either";
  run: (ctx: Ctx, job: Job, s: SourceStatus) => Promise<void>;
}

const REGISTRY_ROUTES: Record<string, DirectAdapter[]> = {
  // ---- Cechia: ARES (API del Ministero della Giustizia, senza chiave) ----
  CZ: [
    {
      id: "ares",
      label: "ARES — Obchodní rejstřík (Min. spravedlnosti ČR)",
      input: "either",
      run: (ctx, job, s) =>
        (async () => {
          const q = ctx.query || ctx.localVat;
          if (!q) {
            s.state = "skipped";
            s.detail = "servi nome o IČO per la ricerca ARES";
            return;
          }
          const r = await searchAres(q);
          if (r.ok && r.data) {
            s.state = "ok";
            s.detail = r.data.registry?.id || "dati societari dal registro";
            job.profile = () => r.data;
          } else if (r.error?.includes("corrispondenza")) {
            s.state = "ok";
            s.detail = "nessuna corrispondenza per la query fornita";
          } else {
            s.state = "failed";
            s.detail = r.error || "fonte non raggiungibile";
          }
        })(),
    },
  ],

  // ---- Norvegia: Brønnøysundregistrene (API aperta, senza chiave) ----
  NO: [
    {
      id: "brreg",
      label: "Brønnøysundregistrene — Enhetsregisteret",
      input: "either",
      run: (ctx, job, s) =>
        (async () => {
          const q = ctx.query || ctx.localVat;
          if (!q) {
            s.state = "skipped";
            s.detail = "servi nome o org.nr per la ricerca";
            return;
          }
          const r = await searchBrreg(q);
          if (r.ok && r.data) {
            s.state = "ok";
            s.detail = r.data.registry?.id || "enhetsregisteret";
            job.profile = () => r.data;
          } else if (r.error?.includes("corrispondenza")) {
            s.state = "ok";
            s.detail = "nessuna corrispondenza per la query fornita";
          } else {
            s.state = "failed";
            s.detail = r.error || "fonte non raggiungibile";
          }
        })(),
    },
  ],

  // ---- Finlandia: YTJ/PRH (open data, senza chiave) ----
  FI: [
    {
      id: "ytj",
      label: "YTJ — PRH (open data)",
      input: "either",
      run: (ctx, job, s) =>
        (async () => {
          // IVA finlandese = FI + Y-tunnus (8 cifre senza trattino).
          const digits = ctx.localVat.replace(/\D/g, "");
          let q = ctx.query;
          if (!q && /^\d{8}$/.test(digits)) q = `${digits.slice(0, 7)}-${digits.slice(7)}`;
          if (!q) {
            s.state = "skipped";
            s.detail = "servi nome o Y-tunnus per la ricerca";
            return;
          }
          const r = await searchYtj(q);
          if (r.ok && r.data) {
            s.state = "ok";
            s.detail = r.data.registry?.id || "YTJ open data";
            job.profile = () => r.data;
          } else if (r.error?.includes("corrispondenza")) {
            s.state = "ok";
            s.detail = "nessuna corrispondenza per la query fornita";
          } else {
            s.state = "failed";
            s.detail = r.error || "fonte non raggiungibile";
          }
        })(),
    },
  ],

  // ---- Francia: INPI (API con chiave gratuita) ----
  FR: [
    {
      id: "inpi",
      label: "INPI — Base SIRENE / RCS",
      input: "either",
      run: (ctx, job, s) =>
        (async () => {
          const r = await searchInpi(ctx.localVat, ctx.query, INPI_KEY ?? "");
          if (r.ok && r.data) {
            s.state = "ok";
            s.detail = r.data.registry?.id || "Base SIRENE";
            job.profile = () => r.data;
          } else if (r.skipped) {
            s.state = "skipped";
            s.detail = r.skipped;
          } else {
            s.state = "failed";
            s.detail = r.error || "fonte non raggiungibile";
          }
        })(),
    },
  ],

  // ---- Bulgaria: Registro Commerciale (scraping del portale pubblico) ----
  BG: [
    {
      id: "bgr",
      label: "Търговски регистър — Agenzia sulle Iscrizioni",
      input: "either",
      run: (ctx, job, s) =>
        (async () => {
          const q = ctx.query || ctx.localVat;
          if (!q) {
            s.state = "skipped";
            s.detail = "servi nome registrato o EIK per la ricerca";
            return;
          }
          const r = await searchBg(q);
          if (r.ok && r.data) {
            s.state = "ok";
            s.detail = r.data.registry?.id || "scheda dal registro";
            job.profile = () => r.data;
          } else if (r.note) {
            s.state = "ok";
            s.detail = r.note;
          } else {
            s.state = "failed";
            s.detail = r.error || "fonte non raggiungibile";
          }
        })(),
    },
  ],
};

// ============================================================================
// FINANCIALS_ROUTES — layer BILANCI: paese → provider gratuito del bilancio.
// Restituisce o (a) valori strutturati per esercizio, o (b) il documento
// ufficiale gratuito (PDF/XBRL) servito IN PAGINA dal proxy del tool
// (/api/company-finder/document) — mai un reindirizzamento esterno.
// ============================================================================

type FinCtx = Ctx;

const FINANCIALS_ROUTES: Record<
  string,
  { id: string; label: string; run: (ctx: FinCtx, job: Job, s: SourceStatus) => Promise<void> }
> = {
  // ---- Paesi Bassi: KVK Open Dataset Jaarrekeningen (ufficiale, senza chiave) ----
  NL: {
    id: "fin-kvk",
    label: "KVK — Open Dataset Jaarrekeningen",
    run: (ctx, job, s) =>
      (async () => {
        // 1) KVK inserito direttamente (8 cifre pure nel campo IVA)
        let kvk = kvkFromInput(ctx.localVat);
        // 2) risolutivo per nome via OpenCorporates (chiave opzionale)
        if (!kvk && OC_KEY && ctx.query) {
          const oc = await ocSearch(ctx.query, "NL", OC_KEY);
          const m = (oc.data?.registry?.id ?? "").match(/\d{8}/);
          kvk = m ? m[0] : undefined;
        }
        if (!kvk) {
          s.state = "skipped";
          s.detail =
            "servi il KVK-nummer (8 cifre) nel campo partita IVA, oppure configura OPEN_CORPORATES_API_KEY per la risoluzione per nome";
          return;
        }
        const r = await fetchKvkJaarrekeningen(kvk);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.years.length
            ? `${r.data.years.length} annualità (XBRL)`
            : "nessuna annualità XBRL depositata";
          job.fin = () => r.data!;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "fonte non raggiungibile";
        }
      })(),
  },

  // ---- Germania: Unternehmensregister (Jahresabschlüsse ufficiali gratuiti) ----
  DE: {
    id: "fin-ur",
    label: "Unternehmensregister — Rendiconti (Jahresabschlüsse)",
    run: (ctx, job, s) =>
      (async () => {
        const q = ctx.query || "Siemens"; // fallback: serve SEMPRE un nome
        if (!ctx.query) {
          s.state = "skipped";
          s.detail = "servi la ragione sociale per la ricerca dei rendiconti";
          return;
        }
        const r = await searchUrAccounting(q);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.documentUrl
            ? r.data.documentTitle || "documento ufficiale gratuito"
            : r.data.note || "nessun documento";
          job.fin = () => r.data!;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "fonte non raggiungibile";
        }
      })(),
  },

  // ---- Francia: Pappers (comptes annuels, chiave gratuita) ----
  FR: {
    id: "fin-pappers",
    label: "Pappers — Comptes annuels (RCS)",
    run: (ctx, job, s) =>
      (async () => {
        if (!PAPPERS_KEY) {
          s.state = "skipped";
          s.detail = "PAPPERS_API_KEY non configurata (chiave gratuita: pappers.fr/developer)";
          return;
        }
        const siren = sirenFromVat(ctx.localVat);
        const r = await fetchPappersFinancials(siren, ctx.query, PAPPERS_KEY);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.years.length
            ? `${r.data.years.length} esercizi`
            : "nessun conto annuale depositato";
          job.fin = () => r.data!;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "fonte non raggiungibile";
        }
      })(),
  },

  // ---- Danimarca: Regnskaber (årsrapporter ufficiali gratuite) ----
  DK: {
    id: "fin-regnskaber",
    label: "Regnskaber — Årsrapporter (CVR)",
    run: (ctx, job, s) =>
      (async () => {
        const cvr = cvrFromVat(ctx.localVat);
        if (!cvr) {
          s.state = "skipped";
          s.detail =
            "CVR-nummer non ricavabile: inserisci il numero CVR a 8 cifre oppure l'IVA danese (DK + CVR)";
          return;
        }
        const r = await fetchDkRegnskaber(cvr);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.documentUrl
            ? r.data.documentTitle || "årsrapport"
            : r.data.note || "nessun årsrapport";
          job.fin = () => r.data!;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "fonte non raggiungibile";
        }
      })(),
  },

  // ---- Belgio: NBB Central Balance Sheet Office (conti annuali ufficiali) ----
  BE: {
    id: "fin-cbso",
    label: "NBB CBSO — conti annuali pubblicati",
    run: (ctx, job, s) =>
      (async () => {
        const cbe = cbeFromInput(ctx.localVat);
        if (!cbe) {
          s.state = "skipped";
          s.detail = "servi il CBE (numero di impresa, 10 cifre) nel campo partita IVA (BE + CBE)";
          return;
        }
        const r = await fetchCbsoAccounts(cbe, NBB_CBSO_KEY, NBB_CBSO_BASE);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.documentTitle || "conti annuali";
          job.fin = () => r.data!;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "fonte non raggiungibile";
        }
      })(),
  },

  // ---- Polonia: Repozytorium Dokumentów Finansowych KRS (bilanci pubblici) ----
  PL: {
    id: "fin-krs-rdf",
    label: "KRS RDF — Repozytorium Dokumentów Finansowych",
    run: (ctx, job, s) =>
      (async () => {
        const krs = krsFromPlInput(ctx.localVat);
        if (!krs) {
          s.state = "skipped";
          s.detail =
            "servi il numero KRS (8 o 10 cifre) nel campo partita IVA per i bilanci depositati";
          return;
        }
        const r = await fetchKrsRdfDocuments(krs);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.documentTitle || "documento finanziario";
          job.fin = () => r.data!;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "fonte non raggiungibile";
        }
      })(),
  },
};

// ============================================================================
// Esecuzione
// ============================================================================

export async function runSearch(req: SearchRequest): Promise<SearchResponse> {
  const warnings: string[] = [];
  const jobs: Job[] = [];

  // ---------- 1. Normalizzazione input ----------
  const query = req.query.trim();
  const vatRaw = req.vat.replace(/[\s.-]/g, "").toUpperCase();
  const m = vatRaw.match(/^([A-Z]{2})([0-9A-Z]{5,16})$/);
  // I gruppi 1 e 2 esistono sempre quando la regex ha fatto match: il `?? ""`
  // è solo per soddisfare noUncheckedIndexedAccess, non cambia il valore.
  const prefixIso = m ? prefixToIso(m[1] ?? "") : "";
  let localVat = m ? (m[2] ?? "") : /^[0-9A-Z]{6,16}$/.test(vatRaw) ? vatRaw : "";
  let countryIso = (prefixIso || req.country || "").toUpperCase();

  // ---------- 1-bis. Ricerca per solo nome: risoluzione via GLEIF ----------
  // Senza numero, quasi nessun registro nazionale è interrogabile e senza paese
  // la ricerca si fermava subito. GLEIF è gratuito e senza chiave: dal nome
  // ricava paese e identificativo di registro (CVR, codice fiscale, SIREN…),
  // che è proprio ciò di cui gli adapter hanno bisogno.
  let gleifMatch: GleifMatch | undefined;
  let gleifStatusDetail = "";
  let gleifFailed = "";
  if (localVat.length < 6 && query.length >= 3) {
    const g = await searchGleif(query, countryIso);
    if (!g.ok) {
      gleifFailed = g.error ?? "fonte non raggiungibile";
    } else if (g.matches.length === 0) {
      gleifStatusDetail = "nessuna entità con LEI corrisponde a questa denominazione";
    } else {
      gleifMatch = g.matches[0];
      const registryId = numericRegistryId(gleifMatch?.registeredAs);
      gleifStatusDetail =
        `${gleifMatch?.name} (${gleifMatch?.country})` +
        (gleifMatch?.registeredAs ? ` · registro ${gleifMatch.registeredAs}` : "");
      if (!countryIso && gleifMatch) countryIso = gleifMatch.country;
      // L'identificativo si usa solo se il paese coincide: un LEI estero non
      // deve dirottare la ricerca su un altro registro.
      if (registryId && gleifMatch?.country === countryIso) localVat = registryId;
    }
  }

  const country = getCountry(countryIso);

  if (!country) {
    return {
      found: false,
      sources: [],
      warnings: [
        query.length >= 3
          ? "Paese non individuato dalla sola ragione sociale: selezionalo nel menu, oppure inserisci il numero di IVA con prefisso (es. DK58495913) o il numero di registro nazionale."
          : "Paese non riconosciuto. Seleziona il paese oppure usa un numero di IVA con prefisso (es. PL7740001454).",
      ],
      searchedAt: new Date().toISOString(),
    };
  }

  const hasVat = localVat.length >= 6;
  // Polonia: 8 cifre = KRS; 10 cifre inizianti per "0000" = KRS moderno
  // (ambiguo con NIP: si prova prima KRS, poi NIP); altre 10 cifre = NIP.
  const pl8 = countryIso === "PL" && /^\d{8}$/.test(localVat);
  const pl10 = countryIso === "PL" && /^\d{10}$/.test(localVat);
  const pl10krs = pl10 && localVat.startsWith("0000");
  const pl10nip = pl10 && !localVat.startsWith("0000");

  const ctx: Ctx = { query, localVat, countryIso };

  // ---------- 2-zero. GLEIF: riporta l'esito gia' ottenuto tra le fonti ----------
  if (gleifMatch || gleifStatusDetail || gleifFailed) {
    const resolved = gleifMatch;
    jobs.push(
      makeJob("gleif", "GLEIF — registro mondiale LEI", async (job, s) => {
        if (gleifFailed) {
          s.state = "failed";
          s.detail = gleifFailed;
          return;
        }
        s.state = "ok";
        s.detail = gleifStatusDetail;
        if (resolved) {
          job.profile = () => ({
            name: resolved.name,
            nameSource: "GLEIF (LEI)",
            country: getCountry(resolved.country) ?? country,
            address: resolved.address,
            status: resolved.status,
            identifiers: [
              { key: "LEI", value: resolved.lei },
              ...(resolved.registeredAs
                ? [{ key: "Registro nazionale", value: resolved.registeredAs }]
                : []),
            ],
          });
        }
      }),
    );
  }

  // ---------- 2a. Registro nazionale (tabella di regia) ----------
  for (const adapter of REGISTRY_ROUTES[countryIso] ?? []) {
    jobs.push(makeJob(adapter.id, adapter.label, (job, s) => adapter.run(ctx, job, s)));
  }

  // ---------- 2a-bis. BILANCI (fonti gratuite, documento in pagina) ----------
  const finAdapter = FINANCIALS_ROUTES[countryIso];
  if (finAdapter) {
    jobs.push(makeJob(finAdapter.id, finAdapter.label, (job, s) => finAdapter.run(ctx, job, s)));
  }

  // NL: 8 cifre pure nel campo IVA = KVK-nummer (NON un numero IVA) → no VIES.
  const nlKvkDirect = countryIso === "NL" && !!kvkFromInput(localVat);
  // ---------- 2b. VIES (tutti i paesi con prefisso IVA) ----------
  if (hasVat && !pl8 && !pl10krs && !nlKvkDirect) {
    jobs.push(
      makeJob("vies", "VIES — Commissione Europea", async (job, s) => {
        const r = await checkVat(countryIso === "GR" ? "EL" : countryIso, localVat);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.valid ? "numero IVA valido" : "numero IVA NON valido o non trovato";
          const d = r.data;
          job.profile = () => ({
            name: d.name,
            nameSource: "VIES",
            vat: { number: d.number, country: d.country, valid: d.valid, checkedAt: d.checkedAt },
            country: getCountry(d.country) || country!,
            address: d.address,
          });
        } else {
          s.state = "failed";
          s.detail = r.error;
        }
      }),
    );
  }

  // ---------- 2c. Polonia: KRS + Biała Lista ----------
  if (countryIso === "PL" && hasVat) {
    jobs.push(
      makeJob("krs", "KRS — Portal Rejestrów Sądowych", async (job, s) => {
        let krs: string | undefined = pl8 || pl10krs ? localVat : undefined;

        if (krs) {
          const r0 = await fetchKrsOdpis(krs);
          if (r0.ok && r0.data) {
            s.state = "ok";
            s.detail = `odpis attuale · KRS ${krs.padStart(10, "0")}`;
            job.profile = () => r0.data;
            return;
          }
          if (pl10krs) {
            krs = undefined; // ambiguo: si prova come NIP
          } else {
            s.state = "failed";
            s.detail = r0.notFound ? "KRS non trovato" : r0.error || "errore KRS";
            return;
          }
        }

        if (pl10 || localVat.length === 10) {
          const sBl: SourceStatus = {
            id: "bialalista",
            label: "Biała Lista VAT — Ministerstwo Finansów",
            state: "skipped",
          };
          const bl = await lookupNip(localVat);
          if (bl.ok) {
            sBl.state = "ok";
            sBl.detail = bl.krs
              ? `KRS ${bl.krs.padStart(10, "0")}`
              : "presente in lista, KRS assente";
            krs = bl.krs;
          } else {
            sBl.state = "failed";
            sBl.detail = bl.error || "fonte non raggiungibile";
          }
          jobs.push({ status: sBl, run: async () => {} });
        }

        if (!krs && OC_KEY) {
          const oc = await ocSearch(query || localVat, "PL", OC_KEY);
          const mm = (oc.data?.registry?.id || "").match(/(\d{6,10})/);
          if (mm) krs = mm[1];
        }

        if (!krs) {
          s.state = "skipped";
          s.detail = "numero KRS non ricavabile dall'IVA in questa configurazione";
          warnings.push(
            "Per i dati completi del registro KRS serve il numero KRS (8 o 10 cifre): inseriscilo nel campo di ricerca oppure configura la chiave OpenCorporates (OPEN_CORPORATES_API_KEY).",
          );
          return;
        }

        const r = await fetchKrsOdpis(krs);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = `odpis attuale · KRS ${krs.padStart(10, "0")}`;
          job.profile = () => r.data;
        } else if (r.notFound) {
          s.state = "failed";
          s.detail = "KRS non trovato";
        } else {
          s.state = "failed";
          s.detail = r.error || "errore KRS";
        }
      }),
    );
  }

  // ---------- 2d. Danimarca: CVR ----------
  if (countryIso === "DK" && hasVat && /^\d{8,9}$/.test(localVat)) {
    jobs.push(
      makeJob("cvr", "CVR — Erhvervsstyrelsen", async (job, s) => {
        const r = await fetchCvr(localVat);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = `CVR ${localVat}`;
          job.profile = () => r.data;
        } else {
          s.state = "failed";
          s.detail = r.error || "CVR non disponibile";
        }
      }),
    );
  }

  // ---------- 2e. Regno Unito: Companies House (chiave) ----------
  if (countryIso === "UK" && (query || hasVat)) {
    jobs.push(
      makeJob("ch", "Companies House", async (job, s) => {
        // Senza chiave l'adapter usa l'endpoint di ricerca (gratuito, no-key)
        // per la scheda; i conti annuali richiedono la chiave gratuita CH.
        const r = await chLookup(query, CH_KEY);
        if (r.ok && r.company) {
          s.state = "ok";
          s.detail = `Company No. ${r.company.number}`;
          const c = r.company;
          job.profile = () => c.profile;
          job.fin = () => ({
            available: (r.financialYears?.length || 0) > 0,
            currency: r.financialYears?.[0]?.currency,
            years: r.financialYears || [],
            source: "Companies House — conti annuali depositati",
            note: r.accountsNote,
          });
        } else {
          s.state = "failed";
          s.detail = r.error || "nessuna corrispondenza";
        }
      }),
    );
  }

  // ---------- 2f. OpenCorporates (chiave opzionale, tutti i paesi) ----------
  if (OC_KEY && (query || (hasVat && !pl8 && !pl10krs))) {
    jobs.push(
      makeJob("oc", "OpenCorporates — registri globali", async (job, s) => {
        const r = await ocSearch(query || localVat, countryIso, OC_KEY!);
        if (r.ok && r.data) {
          s.state = "ok";
          s.detail = r.data.registry?.id || r.data.name;
          job.profile = () => r.data;
        } else if (r.skipped) {
          s.state = "skipped";
          s.detail = r.skipped;
        } else {
          s.state = "failed";
          s.detail = r.error || "nessuna corrispondenza";
        }
      }),
    );
  }

  if (jobs.length === 0) {
    return {
      found: false,
      sources: [],
      warnings: [
        "Nessuna fonte consultabile per questa combinazione di dati. Inserisci un numero di IVA completo (con prefisso) oppure una ragione sociale di almeno 3 caratteri.",
      ],
      searchedAt: new Date().toISOString(),
    };
  }

  // ---------- 3. Esecuzione in parallelo ----------
  const started = new Map<Job, number>();
  await Promise.allSettled(
    jobs.map((j) => {
      started.set(j, Date.now());
      return j.run();
    }),
  );
  for (const j of jobs) j.status.ms = Date.now() - (started.get(j) ?? Date.now());

  // ---------- 4. Merge (priorità: registro nazionale > OC > VIES) ----------
  const directIds = (REGISTRY_ROUTES[countryIso] ?? []).map((a) => a.id);
  const order = [
    ...(countryIso === "PL" ? ["krs"] : []),
    ...(countryIso === "DK" ? ["cvr"] : []),
    ...(countryIso === "UK" ? ["ch"] : []),
    ...directIds,
    "oc",
    "vies",
  ];
  const idx: Record<string, number> = {};
  order.forEach((id, i) => (idx[id] = i));

  // associa ogni profilo al job che l'ha prodotto
  const profilesWithJob: Array<{ p: CompanyProfile; job: Job }> = [];
  const financials: Financials[] = [];
  for (const j of jobs) {
    const p = j.profile?.();
    if (p) profilesWithJob.push({ p, job: j });
    const f = j.fin?.();
    if (f) financials.push(f);
  }

  profilesWithJob.sort((a, b) => (idx[a.job.status.id] ?? 9) - (idx[b.job.status.id] ?? 9));
  let company: CompanyProfile | undefined;
  for (const { p } of profilesWithJob) company = mergeProfile(company, p);

  const viesProfile = profilesWithJob.find((x) => x.job.status.id === "vies")?.p;
  if (viesProfile?.vat?.valid === false) {
    warnings.push(
      `VIES segnala l'IVA ${viesProfile.vat.number} come non valida o non attiva: verifica il numero o la registrazione intracomunitaria.`,
    );
  } else if (company && viesProfile?.name) {
    const regName = profilesWithJob.find((x) => x.job.status.id !== "vies")?.p?.name;
    if (regName && !namesMatch(viesProfile.name, regName)) {
      warnings.push(
        "La ragione sociale risulta diversa tra VIES e il registro consultato: verifica il numero IVA.",
      );
    }
  }

  // ---------- 5. Bilanci ----------
  // priorità: (1) valori strutturati per esercizio, (2) documento ufficiale
  // gratuito servito in pagina, (3) nota di disponibilità del paese.
  const fin =
    financials.find((f) => f.available && f.years.length > 0) ||
    financials.find((f) => f.documentUrl) ||
    financials.find((f) => f.available) ||
    financials[0];
  const financialsOut: Financials =
    fin && (fin.available || fin.documentUrl)
      ? fin
      : {
          available: false,
          years: [],
          note:
            // 1) nota specifica restituita dalla fonte (es. "nessun conto depositato")
            // 2) nota per-paese (spiega la fonte e la chiave gratuita necessaria)
            // 3) messaggio generico di fallback
            fin?.note ||
            country.financials.note ||
            "Per questo paese i bilanci sono disponibili via fonte gratuita: configura la chiave API corrispondente per visualizzarli.",
        };

  // Il bilancio vale anche senza scheda società: se una fonte di bilancio ha
  // restituito dati, la risposta è "found" con una scheda minima.
  const hasFinancials = !!(fin && (fin.documentUrl || (fin.available && fin.years.length > 0)));
  if (!company || !company.name) {
    if (hasFinancials) {
      company = {
        name: query || localVat,
        country,
      };
      warnings.push(
        "Scheda società non completata dalle fonti anagrafiche: mostrati i dati di bilancio disponibili.",
      );
    } else {
      return {
        found: false,
        sources: jobs.map((j) => j.status),
        warnings: [
          ...warnings,
          "Nessuna corrispondenza trovata nelle fonti consultate. Controlla ragione sociale e numero IVA.",
        ],
        searchedAt: new Date().toISOString(),
      };
    }
  }

  // ---------- 6. Risposta ----------
  company.country = country;
  if (!company.vat && viesProfile?.vat) company.vat = viesProfile.vat;

  return {
    found: true,
    company,
    financials: financialsOut,
    sources: jobs.map((j) => j.status),
    warnings,
    searchedAt: new Date().toISOString(),
  };
}

export { OC_KEY, CH_KEY, INPI_KEY };
