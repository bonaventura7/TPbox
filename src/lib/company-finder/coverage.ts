// ---------- Copertura reale, misurata ----------
// Tre livelli, non uno. La differenza conta perché cambia cosa vede l'utente.
//
//  A. AUTOMATICO — il server dell'Osservatorio scarica documento o valori e li
//     mostra in pagina. Nessun clic, nessuna chiave.
//  B. CONSULTAZIONE — il bilancio è gratuito ma il registro rifiuta le chiamate
//     da server (WAF, sessione, CAPTCHA). La sua pagina ufficiale viene
//     incorporata: la carica il browser dell'utente, che passa. Verificato in
//     Chrome che tutti i portali elencati accettano di essere incorporati.
//  C. NESSUNA FONTE GRATUITA — il documento costa. Questi paesi NON sono
//     offerti dal tool: promettere una copertura che non c'è è peggio che
//     dichiararne l'assenza.

/** Livello A: bilancio recuperato dal server e mostrato in pagina. */
export const AUTO_ISOS = ["DE", "NL", "DK", "UK", "FR"] as const;

/**
 * Livello B: bilancio gratuito, consultazione ufficiale incorporata.
 * L'URL è la pagina da cui si arriva al documento depositato.
 */
export const CONSULT_PAGES: Record<string, { url: string; label: string }> = {
  BE: {
    url: "https://consult.cbso.nbb.be/",
    label: "Centrale dei bilanci — Banca nazionale del Belgio",
  },
  PL: {
    url: "https://ekrs.ms.gov.pl/rdf/pd/search_df",
    label: "KRS — Repozytorium Dokumentów Finansowych",
  },
  LU: {
    url: "https://www.lbr.lu/mjrcs-web-front/",
    label: "LBR — Registre de commerce et des sociétés",
  },
  GR: {
    url: "https://publicity.businessportal.gr/",
    label: "ΓΕΜΗ — Registro generale del commercio",
  },
  CZ: { url: "https://or.justice.cz/ias/ui/rejstrik", label: "Obchodní rejstřík — Sbírka listin" },
  EE: { url: "https://ariregister.rik.ee/eng", label: "e-Äriregister — Centro dei registri" },
  FI: { url: "https://tietopalvelu.ytj.fi/", label: "YTJ / PRH — Servizio informazioni imprese" },
  SK: {

    url: "https://www.registeruz.sk/cruz-public/domain/accountingentity/simplesearch",
    label: "Register účtovných závierok",
  },
  SI: { url: "https://www.ajpes.si/jolp/", label: "AJPES JOLP — Bilanci annuali" },
  LV: { url: "https://www.ur.gov.lv/lv/", label: "Uzņēmumu reģistrs — sezione pubblica" },
  LT: {
    url: "https://www.registrucentras.lt/jar/p/",
    label: "Registrų centras — Registro imprese",
  },
  BG: {
    url: "https://portal.registryagency.bg/CR/en/Reports/VerificationPersonOrg",
    label: "Търговски регистър — Registry Agency",
  },
  PT: {
    url: "https://publicacoes.mj.pt/Pesquisa.aspx",
    label: "Publicações — Ministério da Justiça",
  },
  RO: {
    url: "https://www.mfinante.gov.ro/domenii/informatii-contribuabili/persoane-juridice/info-pj-selectie-dupa-cui",
    label: "Ministerul Finanțelor — Situații financiare",
  },
  HR: {
    url: "https://rgfi.fina.hr/JavnaObjava-web/jsp/prijavaKorisnika.jsp",
    label: "FINA RGFI — Registro dei bilanci",
  },
  NO: { url: "https://virksomhet.brreg.no/", label: "Brønnøysundregistrene — Regnskapsregisteret" },
};

/**
 * Livello C: il bilancio non è gratuito. Il tool non li offre; la nota dice
 * quanto costa e dove, così l'utente sa dove andare invece di girare a vuoto.
 */
export const NO_FREE_SOURCE: Record<string, string> = {
  IT: "I bilanci sono depositati presso le CCIAA: copia integrale 4,50–6 € su registroimprese.it. Gratis solo la propria impresa, via Impresa Italia con SPID.",
  ES: "Le cuentas anuales del Registro Mercantil sono a pagamento. Gratuiti solo i conti auditati delle società quotate, sul portale CNMV.",
  SE: "Bolagsverket rilascia l'årsredovisning a tariffa, circa 100 SEK a documento.",
  CY: "Il fascicolo societario del DRCOR, che contiene i conti, costa 10 €.",
  AT: "Il Firmenbuch consente la ricerca gratuita ma il documento Jahresabschluss costa circa 1,44 € a copia.",
  IE: "Il CRO rilascia i documenti, conti inclusi, a tariffa per documento.",
  MT: "Il Malta Business Registry applica un costo per la documentazione societaria.",
  IS: "Nessun canale gratuito verificato per i bilanci islandesi.",
  LI: "In Liechtenstein i conti annuali non sono pubblicati online.",
};

/**
 * Livello B2 — SOLO BROWSER. Il bilancio è gratuito, ma il registro impone un
 * controllo che va completato dalla persona (verifica anti-bot, sessione) e
 * rifiuta di essere incorporato in un iframe (X-Frame-Options: DENY). Si apre
 * quindi in una nuova scheda, con istruzioni: nessun controllo viene aggirato.
 */
export const BROWSER_ONLY_PAGES: Record<string, { url: string; label: string }> = {
  HU: {
    url: "https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses",
    label: "e-Beszámoló — Ministero della Giustizia",
  },
};

/** Il tool copre un paese solo se il bilancio è ottenibile gratis. */
export function isCovered(iso: string): boolean {
  return (
    (AUTO_ISOS as readonly string[]).includes(iso) ||
    iso in CONSULT_PAGES ||
    iso in BROWSER_ONLY_PAGES
  );
}

