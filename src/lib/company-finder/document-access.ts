// ---------- Macchina a stati dell'accesso al DOCUMENTO di bilancio ----------
// Per ogni paese il tool deve dire COSA può consegnare davvero, non che
// "esiste un registro". Quattro stati, uno solo per paese, con la ragione
// scritta: è lei che finisce nelle note mostrate all'utente.
//
//  document   DOCUMENT_AVAILABLE — il server scarica valori o il documento
//             ufficiale e lo mostra in pagina (nessun passaggio umano).
//  list       LIST_ONLY — il documento è gratuito e il portale è pubblico:
//             la pagina ufficiale viene incorporata o linkata, ma la ricerca
//             del deposito la fa l'utente nel portale.
//  restricted SOURCE_RESTRICTED — il documento esiste ed è gratuito, ma la
//             fonte è raggiungibile SOLO da una persona (CAPTCHA, login,
//             condizioni d'uso che vietano l'accesso automatizzato o da reti
//             anonimizzanti). Il tool non finge un'integrazione che violerebbe
//             i termini del registro: apre il portale e spiega il percorso.
//  registry   REGISTRY_ONLY — il registro esiste ma il documento non è
//             gratuito: il tool non è offerto per quel paese e lo dice.
//
// Ogni voce porta `reason`, la prova della classificazione. Chi in futuro
// cambia uno stato deve cambiare anche la prova: la classificazione senza
// prova è esattamente il difetto che questa macchina elimina.

export type DocumentAccess = "document" | "list" | "restricted" | "registry";

export interface AccessConsult {
  url: string;
  label: string;
  /**
   * true = NON incorporare in iframe: la pagina esige interazione umana
   * (CAPTCHA, login) o rifiuta l'embedding. Si offre solo il link.
   */
  browserOnly: boolean;
}

export interface AccessBulkChannel {
  url: string;
  label: string;
  note: string;
}

export interface AccessInfo {
  tier: DocumentAccess;
  /** Prova della classificazione; finisce nelle note utente. */
  reason: string;
  consult?: AccessConsult;
  bulk?: AccessBulkChannel;
}

const DOCUMENT_REASON =
  "Il server del tool scarica il documento o i valori dall'API pubblica del registro e li mostra in pagina: nessun passaggio manuale.";

export const DOCUMENT_ACCESS: Record<string, AccessInfo> = {
  // ------------------------------------------------------------------
  // DOCUMENT_AVAILABLE — fonte interrogata dal server, oggi.
  // ------------------------------------------------------------------
  DE: { tier: "document", reason: DOCUMENT_REASON },
  NL: { tier: "document", reason: DOCUMENT_REASON },
  DK: { tier: "document", reason: DOCUMENT_REASON },
  UK: { tier: "document", reason: DOCUMENT_REASON },
  FR: { tier: "document", reason: DOCUMENT_REASON },

  // ------------------------------------------------------------------
  // LIST_ONLY — portale pubblico; la ricerca del deposito resta all'utente.
  // ------------------------------------------------------------------
  BE: {
    tier: "list",
    reason:
      "Il punto di consultazione NBB è pubblico: il tool apre la scheda d'impresa (o, con chiave NBB gratuita, scarica direttamente il documento).",
    consult: {
      url: "https://consult.cbso.nbb.be/",
      label: "Centrale dei bilanci — Banca nazionale del Belgio",
      browserOnly: false,
    },
  },
  LU: {
    tier: "list",
    reason:
      "LBR pubblica i depositi: il tool apre la scheda società sulla sezione depositi; l'eventuale autenticazione resta sul portale.",
    consult: {
      url: "https://www.lbr.lu/mjrcs-web-front/",
      label: "LBR — Registre de commerce et des sociétés",
      browserOnly: true,
    },
  },
  CZ: {
    tier: "list",
    reason:
      "La Sbírka listin espone le účetní závěrky in PDF gratuito dal portale pubblico del Ministero della Giustizia CZ.",
    consult: {
      url: "https://or.justice.cz/ias/ui/rejstrik",
      label: "Obchodní rejstřík — Sbírka listin",
      browserOnly: false,
    },
  },
  EE: {
    tier: "list",
    reason: "L'e-Äriregister espone la consultazione pubblica delle società.",
    consult: {
      url: "https://ariregister.rik.ee/eng",
      label: "e-Äriregister — Centro dei registri",
      browserOnly: false,
    },
  },
  FI: {
    tier: "list",
    reason: "YTJ espone la scheda open data; il documento tilinpäätös resta sul servizio PRH.",
    consult: {
      url: "https://tietopalvelu.ytj.fi/",
      label: "YTJ / PRH — Servizio informazioni imprese",
      browserOnly: false,
    },
  },
  LV: {
    tier: "list",
    reason: "L'Uzņēmumu reģistrs espone una sezione pubblica di consultazione.",
    consult: {
      url: "https://www.ur.gov.lv/lv/",
      label: "Uzņēmumu reģistrs — sezione pubblica",
      browserOnly: false,
    },
  },
  LT: {
    tier: "list",
    reason: "Il Registrų centras espone la consultazione pubblica del JAR.",
    consult: {
      url: "https://www.registrucentras.lt/jar/p/",
      label: "Registrų centras — Registro imprese",
      browserOnly: false,
    },
  },
  BG: {
    tier: "list",
    reason: "Il Търговски регистър espone la verifica pubblica di persone e enti.",
    consult: {
      url: "https://portal.registryagency.bg/CR/en/Reports/VerificationPersonOrg",
      label: "Търговски регистър — Registry Agency",
      browserOnly: false,
    },
  },
  PT: {
    tier: "list",
    reason: "Il portale Publicações del Ministério da Justiça espone la ricerca pubblica.",
    consult: {
      url: "https://publicacoes.mj.pt/Pesquisa.aspx",
      label: "Publicações — Ministério da Justiça",
      browserOnly: false,
    },
  },
  SK: {
    tier: "list",
    reason: "Il Register účtovných závierok espone la ricerca pubblica delle relazioni annuali.",
    consult: {
      url: "https://www.registeruz.sk/cruz-public/domain/accountingentity/simplesearch",
      label: "Register účtovných závierok",
      browserOnly: false,
    },
  },
  SI: {
    tier: "list",
    reason: "AJPES espone i prospetti annuali sul portale pubblico JOLP.",
    consult: {
      url: "https://www.ajpes.si/jolp/",
      label: "AJPES JOLP — Bilanci annuali",
      browserOnly: false,
    },
  },
  RO: {
    tier: "list",
    reason: "Il Ministerul Finanțelor pubblica le situații financiare per CUI (ricerca pubblica).",
    consult: {
      url: "https://www.mfinante.gov.ro/domenii/informatii-contribuabili/persoane-juridice/info-pj-selectie-dupa-cui",
      label: "Ministerul Finanțelor — Situații financiare",
      browserOnly: false,
    },
  },
  NO: {
    tier: "list",
    reason:
      "I Regnskapsregisteret di Brønnøysund sono consultabili online; l'API aperta copre la scheda societaria (regnskap via portale).",
    consult: {
      url: "https://virksomhet.brreg.no/",
      label: "Brønnøysundregistrene — Regnskapsregisteret",
      browserOnly: false,
    },
  },

  // ------------------------------------------------------------------
  // SOURCE_RESTRICTED — gratuiti per una persona, non per un programma.
  // La prova è nelle condizioni d'uso o nella protezione tecnica.
  // ------------------------------------------------------------------
  HU: {
    tier: "restricted",
    reason:
      "Il portale e-Beszámoló (Ministero della Giustizia) è gratuito ma la ricerca esige un solo identificativo (cégjegyzékszám, prime 8 cifre dell'adószám o cégnév di almeno 4 caratteri) e un CAPTCHA; gli URL dei risultati contengono token cifrati legati alla sessione e decadono — non sono permalink di documento. Le condizioni d'uso vietano l'accesso da reti che mascherano l'IP (\"A rendszer a valós IP címet elrejtő Anonymous Proxy hálózatokból nem használható\", §4.3 finalità di tutela dei creditori e non di acquisizione del database, §5.3 denuncia per chi aggira le limitazioni): un adapter automatico non è percorribile.",
    consult: {
      url: "https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses",
      label: "e-Beszámoló — Ministero della Giustizia (HU)",
      browserOnly: true,
    },
    bulk: {
      url: "https://e-beszamolo.im.gov.hu/beszamolo_allomany_ertekesitese",
      label: "Beszámoló állomány értékesítése — canale massivo",
      note: "Per volumi esiste il canale massivo ufficiale: modulo csoportos_beszamolo_kero_lap.docx da inviare via e-mail, evasione manuale, copre i depositi dal 2016 in poi (i bilanci IFRS e delle case madri di stabili organizzazioni arrivano in PDF).",
    },
  },
  GR: {
    tier: "restricted",
    reason:
      "Il portale ΓΕΜΗ/BusinessPortal espone gratuitamente i depositi iXBRL ma è protetto da reCAPTCHA: la ricerca e lo scaricamento restano operazioni manuali nel browser. Quando il provider individua il link diretto al filing iXBRL, il tool lo usa come destinazione primaria.",
    consult: {
      url: "https://publicity.businessportal.gr/",
      label: "ΓΕΜΗ — Registro generale del commercio",
      browserOnly: true,
    },
  },
  PL: {
    tier: "restricted",
    reason:
      "La Repozytorium Dokumentów Finansowych (KRS) rifiuta le richieste da server (403/verifiche anti-bot): il documento Roczne sprawozdanie finansowe va cercato e scaricato nel browser. Scheda societaria e KRS restano interrogabili via API aperta del registro.",
    consult: {
      url: "https://ekrs.ms.gov.pl/rdf/pd/search_df",
      label: "KRS — Repozytorium Dokumentów Finansowych",
      browserOnly: true,
    },
  },
  HR: {
    tier: "restricted",
    reason:
      "Il servizio FINA RGFI (Registri godišnjih financijskih izvještaja) si apre su una pagina di accesso utente: la consultazione dei financijski izvještaji resta un percorso interattivo nel portale.",
    consult: {
      url: "https://rgfi.fina.hr/JavnaObjava-web/jsp/prijavaKorisnika.jsp",
      label: "FINA RGFI — Registro dei bilanci",
      browserOnly: true,
    },
  },

  // ------------------------------------------------------------------
  // REGISTRY_ONLY — documento non gratuito: il tool non è offerto.
  // La `reason` dice quanto costa e dove, invece di girare a vuoto.
  // ------------------------------------------------------------------
  IT: {
    tier: "registry",
    reason:
      "I bilanci sono depositati presso le CCIAA: copia integrale 4,50–6 € su registroimprese.it. Gratis solo la propria impresa, via Impresa Italia con SPID. Per le società quotate il tool recupera invece il deposito ESEF (gratuito).",
  },
  ES: {
    tier: "registry",
    reason:
      "Le cuentas anuales del Registro Mercantil sono a pagamento. Gratuiti solo i conti auditati delle società quotate, sul portale CNMV.",
  },
  SE: {
    tier: "registry",
    reason: "Bolagsverket rilascia l'årsredovisning a tariffa, circa 100 SEK a documento.",
  },
  CY: {
    tier: "registry",
    reason: "Il fascicolo societario del DRCOR, che contiene i conti, costa 10 €.",
  },
  AT: {
    tier: "registry",
    reason:
      "Il Firmenbuch consente la ricerca gratuita ma il documento Jahresabschluss costa circa 1,44 € a copia.",
  },
  IE: {
    tier: "registry",
    reason: "Il CRO rilascia i documenti, conti inclusi, a tariffa per documento.",
  },
  MT: {
    tier: "registry",
    reason: "Il Malta Business Registry applica un costo per la documentazione societaria.",
  },
  IS: {
    tier: "registry",
    reason: "Nessun canale gratuito verificato per i bilanci islandesi.",
  },
  LI: {
    tier: "registry",
    reason: "In Liechtenstein i conti annuali non sono pubblicati online.",
  },
};

/** Stato di accesso al documento per un paese; undefined = nessun canale. */
export function documentAccessFor(iso: string): AccessInfo | undefined {
  return DOCUMENT_ACCESS[iso.toUpperCase()];
}

export function documentTierFor(iso: string): DocumentAccess | undefined {
  return documentAccessFor(iso)?.tier;
}

/**
 * Il tool è offerto per un paese solo se esiste un canale onesto verso il
 * bilancio: automatico, consultabile o ristretto (con percorso umano guidato).
 * I paesi "registry" restano fuori: promettere un documento che si paga è
 * peggio che dichiararne l'assenza.
 */
export function isOffered(iso: string): boolean {
  const tier = documentTierFor(iso);
  return tier === "document" || tier === "list" || tier === "restricted";
}
