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
export const AUTO_ISOS = ["DE", "NL", "DK", "UK", "FR", "EE", "NO"] as const;

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
  FI: { url: "https://tietopalvelu.ytj.fi/", label: "YTJ / PRH — Servizio informazioni imprese" },
  SK: {
    url: "https://www.registeruz.sk/cruz-public/domain/accountingentity/simplesearch",
    label: "Register účtovných závierok",
  },
  SI: { url: "https://www.ajpes.si/jolp/", label: "AJPES JOLP — Bilanci annuali" },
  LV: { url: "https://www.ur.gov.lv/lv/", label: "Uzņēmumu reģistrs — sezione pubblica" },
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
  // LT era qui per errore: su Registrų centras i documenti finanziari si
  // ORDINANO a pagamento ("Finansinių ataskaitų dokumentų užsakymas"); gratis
  // è solo il deposito. Spostata correttamente in NO_FREE_SOURCE.
};

/**
 * Livello C: il bilancio non è gratuito. Il tool non li offre; la nota dice
 * quanto costa e dove, così l'utente sa dove andare invece di girare a vuoto.
 */
export const NO_FREE_SOURCE: Record<string, string> = {
  IT: "I bilanci sono depositati presso le CCIAA: copia integrale 4,50–6 € su registroimprese.it. Gratis solo la propria impresa, via Impresa Italia con SPID.",
  ES: "Le cuentas anuales del Registro Mercantil sono a pagamento. Gratuiti solo i conti auditati delle società quotate, sul portale CNMV.",
  CY: "Il fascicolo societario del DRCOR, che contiene i conti, costa 10 €.",
  IE: "Il CRO rilascia i documenti, conti inclusi, a tariffa per documento.",
  MT: "Il Malta Business Registry applica un costo per la documentazione societaria.",
  LT: "Su Registrų centras la consultazione dei documenti finanziari (Finansinių ataskaitų dokumentų užsakymas) è a tariffa, pochi euro a documento; gratuito è solo il deposito. Gli open data JAR coprono anagrafiche e organi, non i bilanci.",
  IS: "Nessun canale gratuito verificato per i bilanci islandesi.",
  LI: "In Liechtenstein i conti annuali non sono pubblicati online.",
  // SE e AT erano qui con tariffe ormai superate:
  //  - SE: i documenti Bolagsverket si scaricano gratis da allaarsredovisningar.se
  //  - AT: da marzo 2025 i dati del Firmenbuch sono HVD (CC-BY), vedi BROWSER_ONLY
};

/**
 * Livello B2 — SOLO BROWSER. Il bilancio è gratuito, ma la consultazione va
 * completata nel browser della persona: perché il registro impone un controllo
 * anti-bot e rifiuta l'incorporamento (HU, verificato: X-Frame-Options DENY),
 * oppure perché la via gratuita è l'interfaccia pubblica di un terzo che
 * redistribuisce i dati ufficiali (AT, SE) la cui incorporabilità non è
 * garantita. Si apre in una nuova scheda, con istruzioni: nessun controllo
 * viene aggirato.
 */
export const BROWSER_ONLY_PAGES: Record<string, { url: string; label: string }> = {
  HU: {
    url: "https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses",
    label: "e-Beszámoló — Ministero della Giustizia",
  },
  AT: {
    url: "https://openfirmenbuch.at/",
    label: "OpenFirmenbuch — interfaccia gratuita dei dati Firmenbuch (BMJ, CC-BY)",
  },
  SE: {
    url: "https://allaarsredovisningar.se/",
    label: "Allaårsredovisningar — årsredovisningar ufficiali Bolagsverket",
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
