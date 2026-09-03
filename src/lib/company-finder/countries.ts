import type { CountryInfo, Iso2 } from "./types";

/**
 * Catalogo paesi UE + UK.
 * Fonti: e-justice.europa.eu (registri imprese per paese) + verifica API agosto 2026.
 */
export const COUNTRIES: CountryInfo[] = [
  {
    iso: "IT",
    nameIt: "Italia",
    flag: "🇮🇹",
    vatPrefix: "IT",
    registryName: "Registro Imprese (InfoCamere)",
    registryAuthority: "Camere di Commercio",
    financials: {
      free: false,
      note: "I bilanci sono depositati presso le CCIAA (XBRL dal 2024) e a pagamento (~5-7 €). Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso CONSOB/ESMA, consultabili direttamente sul sito dell'autorità.",
    },
  },
  {
    iso: "DE",
    nameIt: "Germania",
    flag: "🇩🇪",
    vatPrefix: "DE",
    registryName: "Handelsregister / Unternehmensregister",
    registryAuthority: "Tribunali distrettuali (Amtsgericht)",
    financials: {
      free: true,
      note: "I rendiconti (Jahresabschlüsse) sono UFFICIALMENTE GRATUITI per le società di capitali (GmbH, AG, KGaA) via Unternehmensregister/Bundesanzeiger: il tool interroga il portale ufficiale e serve il documento del bilancio in questa pagina, senza reindirizzamenti.",
    },
  },
  {
    iso: "FR",
    nameIt: "Francia",
    flag: "🇫🇷",
    vatPrefix: "FR",
    registryName: "Registre du Commerce et des Sociétés (RCS) / INPI",
    registryAuthority: "Tribunali di commercio / INPI",
    financials: {
      free: true,
      note: "I conti annuali (comptes annuels) depositati presso i tribunali di commercio sono GRATUITI: con la chiave gratuita PAPPERS_API_KEY il tool mostra i valori per esercizio (ricavi, utile, patrimonio, attivo).",
    },
  },
  {
    iso: "ES",
    nameIt: "Spagna",
    flag: "🇪🇸",
    vatPrefix: "ES",
    registryName: "Registro Mercantil",
    registryAuthority: "Registro Mercantil Central",
    financials: {
      free: false,
      note: "I bilanci (cuentas anuales) sono a pagamento nei registri mercantili. Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso CNMV/ESMA, consultabili direttamente sul sito dell'autorità.",
    },
  },
  {
    iso: "NL",
    nameIt: "Paesi Bassi",
    flag: "🇳🇱",
    vatPrefix: "NL",
    registryName: "Handelsregister (KVK)",
    registryAuthority: "Kamer van Koophandel",
    financials: {
      free: true,
      note: "Le annualità (jaarrekeningen) depositate in XBRL sono GRATUITE via KVK Open Dataset: inserisci il KVK-nummer (8 cifre) nel campo partita IVA (oppure configura OpenCorporates per la risoluzione per nome) e il tool mostra i valori (attivo, patrimonio, utile) delle annualità disponibili.",
    },
  },
  {
    iso: "BE",
    nameIt: "Belgio",
    flag: "🇧🇪",
    vatPrefix: "BE",
    registryName: "Banque-Carrefour des Entreprises (BCE/KBO)",
    registryAuthority: "Crossroads Bank for Enterprises",
    financials: {
      free: true,
      note: "Le annualità (jaarrekeningen) sono gratuite presso la Banque Nationale de Belgique (NBB); con la chiave gratuita NBB-CBSO il tool scarica il documento ufficiale dei conti annuali e lo mostra in pagina; inserisci il CBE (10 cifre) nel campo partita IVA.",
    },
  },
  {
    iso: "AT",
    nameIt: "Austria",
    flag: "🇦🇹",
    vatPrefix: "AT",
    registryName: "Firmenbuch / Unternehmensregister",
    registryAuthority: "Tribunali (Bezirksgericht)",
    financials: {
      free: false,
      note: "I bilanci (Jahresabschluss) sono a pagamento su Unternehmensregister.at (registrazione gratuita). Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso FMA/ESMA.",
    },
  },
  {
    iso: "PL",
    nameIt: "Polonia",
    flag: "🇵🇱",
    vatPrefix: "PL",
    registryName: "Krajowy Rejestr Sądowy (KRS)",
    registryAuthority: "Ministero della Giustizia — Portal Rejestrów Sądowych",
    financials: {
      free: true,
      note: "I bilanci (sprawozdania finansowe) depositati in KRS sono pubblici e gratuiti: il tool li recupera dal Repozytorium Dokumentów Finansowych (Ministero della Giustizia PL) e li mostra in pagina. Inserisci il numero KRS (8 o 10 cifre) nel campo partita IVA.",
    },
  },
  {
    iso: "DK",
    nameIt: "Danimarca",
    flag: "🇩🇰",
    vatPrefix: "DK",
    registryName: "CVR — Virksomhedsregisteret",
    registryAuthority: "Erhvervsstyrelsen",
    financials: {
      free: true,
      note: "Le årsrapporter sono pubbliche e gratuite dal 2004: il tool le preleva dall'indice aperto di Erhvervsstyrelsen (distribution.virk.dk) e mostra il documento ufficiale in pagina, senza chiave. Serve il numero CVR a 8 cifre, che coincide con le cifre dell'IVA danese.",
    },
  },
  {
    iso: "FI",
    nameIt: "Finlandia",
    flag: "🇫🇮",
    vatPrefix: "FI",
    registryName: "Kaupparekisteri (PRH)",
    registryAuthority: "Patentti- ja rekisterihallitus",
    financials: {
      free: false,
      note: "I bilanci (tilinpäätös) su Virre (PRH) costano ~6 € + IVA. Il tool mostra comunque la scheda completa da YTJ (open data). Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso ESMA.",
    },
  },
  {
    iso: "SE",
    nameIt: "Svezia",
    flag: "🇸🇪",
    vatPrefix: "SE",
    registryName: "Bolagsverket (allmänt företagsregister)",
    registryAuthority: "Bolagsverket",
    financials: {
      free: false,
      note: "I bilanci ufficiali (årsredovisning) costano 60-100 SEK su Bolagsverket. Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso Nasdaq Stockholm/ESMA.",
    },
  },
  {
    iso: "NO",
    nameIt: "Norvegia (SEE)",
    flag: "🇳🇴",
    vatPrefix: "NO",
    registryName: "Enhetsregisteret (Brønnøysundregistrene)",
    registryAuthority: "Skatteetaten",
    financials: {
      free: false,
      note: "I dati della società (nome, forma, indirizzo, settore, organigramma) sono disponibili in tempo reale dall'API aperta di Brønnøysundregistrene. Le relazioni finanziarie (regnskap) sono depositate presso Brønnøysundregistrene (Finansnæringsavdelingen) e consultabili online senza API strutturata gratuita. In questa vista: scheda completa dal registro.",
    },
  },
  {
    iso: "IS",
    nameIt: "Islanda (SEE)",
    flag: "🇮🇸",
    vatPrefix: "IS",
    registryName: "Félagaskrá (Skatturinn)",
    registryAuthority: "Skatturinn (Agenzia delle Entrate islandese)",
    financials: {
      free: false,
      note: "I dati societari sono disponibili nel registro pubblico (félagaskrá) gestito da Skatturinn; l'accesso strutturato avviene tramite il portale, senza API gratuita stabile. In questa vista: identità e stato dal VIES.",
    },
  },
  {
    iso: "LI",
    nameIt: "Liechtenstein (SEE)",
    flag: "🇱🇮",
    vatPrefix: "LI",
    registryName: "Handelsregister (HRA)",
    registryAuthority: "Amt 710 — Handelsregister",
    financials: {
      free: false,
      note: "I dati del registro (Handelsregister) sono consultabili online; i bilanci non sono esposti in forma strutturata gratuita. In questa vista: identità e stato dal VIES.",
    },
  },
  {
    iso: "PT",
    nameIt: "Portogallo",
    flag: "🇵🇹",
    vatPrefix: "PT",
    registryName: "Registo Nacional de Pessoas Coletivas (RNPC)",
    registryAuthority: "Instituto dos Registos e do Notariado",
    financials: {
      free: false,
      note: "Le contas annuali richiedono certidão a pagamento (IRN). Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso CMVM/ESMA.",
    },
  },
  {
    iso: "CZ",
    nameIt: "Cechia",
    flag: "🇨🇿",
    vatPrefix: "CZ",
    registryName: "Obchodní rejstřík",
    registryAuthority: "Ministerstvo spravedlnosti",
    financials: {
      free: true,
      note: "I bilanci (účetní závěrka) sono PDF gratuiti nella «Sbírka listin» (or.justice.cz); l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "RO",
    nameIt: "Romania",
    flag: "🇷🇴",
    vatPrefix: "RO",
    registryName: "Registrul Comerțului (ONRC)",
    registryAuthority: "Oficiul Național al Registrului Comerțului",
    financials: {
      free: true,
      note: "Le situazioni finanziarie (situații financiare) sono depositate presso l'ONRC e pubbliche; l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "HU",
    nameIt: "Ungheria",
    flag: "🇭🇺",
    vatPrefix: "HU",
    registryName: "Cégjegyzék (Cégkapu)",
    registryAuthority: "Tribunali (Megyei bíróság)",
    financials: {
      free: true,
      note: "I rendiconti annuali (éves beszámolók) sono pubblici e gratuiti sul portale Cégkapu; l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "IE",
    nameIt: "Irlanda",
    flag: "🇮🇪",
    vatPrefix: "IE",
    registryName: "Companies Registration Office (CRO)",
    registryAuthority: "Companies Registration Office",
    financials: {
      free: false,
      note: "I bilanci (financial statements) su CORE (CRO) costano ~2,50 €/documento. Alternativa gratuita: per le società quotate, i bilanci ESEF sono gratuiti presso ESMA/EMEA.",
    },
  },
  {
    iso: "GR",
    nameIt: "Grecia",
    flag: "🇬🇷",
    vatPrefix: "EL",
    registryName: "ΓΕΜΗ (GEMI) — Business Portal",
    registryAuthority: "ΚΕΕΕ — Ministero dello Sviluppo",
    financials: {
      free: true,
      note: "I bilanci depositati (Οικονομικές Καταστάσεις) sono gratuiti nel registro ΓΕΜΗ. Con la chiave API GEMI_API_KEY (gratuita, opendata.businessportal.gr) il tool li recupera dal registro e li serve in questa pagina: apertura in pagina e download con un clic, senza uscire dal sito. Senza chiave resta l'identità (VIES) e la consultazione ufficiale, protetta da reCAPTCHA.",
    },
  },
  {
    iso: "HR",
    nameIt: "Croazia",
    flag: "🇭🇷",
    vatPrefix: "HR",
    registryName: "Sudski registar",
    registryAuthority: "Tribunali (sudreg)",
    financials: {
      free: true,
      note: "I prospetti finanziari (financijski izvještaji) sono pubblici sul Sudski registar; l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "BG",
    nameIt: "Bulgaria",
    flag: "🇧🇬",
    vatPrefix: "BG",
    registryName: "Търговски регистър",
    registryAuthority: "Агенция по вписванията",
    financials: {
      free: true,
      note: "Le dichiarazioni annuali (годишен отчет) sono depositate nel registro e gratuite; l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "SK",
    nameIt: "Slovacchia",
    flag: "🇸🇰",
    vatPrefix: "SK",
    registryName: "Obchodný register",
    registryAuthority: "Ministerstvo spravodlivosti SR",
    financials: {
      free: true,
      note: "Le relazioni finanziarie (účetná závierka) sono depositate presso l'ORSR; l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "SI",
    nameIt: "Slovenia",
    flag: "🇸🇮",
    vatPrefix: "SI",
    registryName: "Sodni register (AJPES)",
    registryAuthority: "AJPES — Agenzia per i registri pubblici",
    financials: {
      free: true,
      note: "AJPES espone dati finanziari aperti (ePRS); l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "LT",
    nameIt: "Lituania",
    flag: "🇱🇹",
    vatPrefix: "LT",
    registryName: "Juridinių asmenų registras (JAR)",
    registryAuthority: "Registrų centras",
    financials: {
      free: false,
      note: "Le relazioni finanziarie (finansinės ataskaitos) su JAR costano ~2-4 €.",
    },
  },
  {
    iso: "LV",
    nameIt: "Lettonia",
    flag: "🇱🇻",
    vatPrefix: "LV",
    registryName: "Uzņēmumu reģistrs",
    registryAuthority: "Uzņēmumu reģistrs",
    financials: {
      free: true,
      note: "Le relazioni annuali (gada pārskati) sono depositate nell'Uzņēmumu reģistrs e pubbliche; l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "EE",
    nameIt: "Estonia",
    flag: "🇪🇪",
    vatPrefix: "EE",
    registryName: "Äriregister (e-Keskkond)",
    registryAuthority: "Registri- ja infobüro",
    financials: {
      free: false,
      note: "Le relazioni annuali (aastaaruanne) costano ~2 € su e-Keskkond; i dati anagrafici sono aperti.",
    },
  },
  {
    iso: "CY",
    nameIt: "Cipro",
    flag: "🇨🇾",
    vatPrefix: "CY",
    registryName: "Department of Registrar of Companies",
    registryAuthority: "Ministero delle Finanze",
    financials: {
      free: false,
      note: "I report finanziari su drcor.mcit.gov.cy costano ~10 €; molti dati richiedono richiesta cartacea.",
    },
  },
  {
    iso: "LU",
    nameIt: "Lussemburgo",
    flag: "🇱🇺",
    vatPrefix: "LU",
    registryName: "Registre de Commerce et des Sociétés (RCSL)",
    registryAuthority: "Luxembourg Business Register",
    financials: {
      free: true,
      note: "I documenti depositati (comptes annuels) sono gratuiti su LBR/GDD (account gratuito); l'accesso strutturato è in espansione.",
    },
  },
  {
    iso: "MT",
    nameIt: "Malta",
    flag: "🇲🇹",
    vatPrefix: "MT",
    registryName: "Malta Business Registry",
    registryAuthority: "Malta Business Registry",
    financials: {
      free: false,
      note: "I bilanci su MBR sono a tariffa fissa (~5 €) con account gratuito.",
    },
  },
  {
    iso: "UK",
    nameIt: "Regno Unito",
    flag: "🇬🇧",
    vatPrefix: "GB",
    registryName: "Companies House",
    registryAuthority: "Companies House (HM Government)",
    financials: {
      free: true,
      note: "I conti annuali (accounts) sono pubblicati su Companies House e disponibili in tempo reale tramite API gratuita: con la chiave API configurata, questa vista mostra i valori di bilancio (ricavi, utile, attivi, patrimonio) dell'ultimo esercizio depositato.",
    },
  },
];

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export function getCountry(iso: Iso2): CountryInfo | undefined {
  return BY_ISO.get(iso.toUpperCase());
}

export const ALL_COUNTRIES = COUNTRIES;
