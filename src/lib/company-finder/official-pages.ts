// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Alcuni registri richiedono un browser reale o una sessione ufficiale.

import { BROWSER_ONLY_PAGES, CONSULT_PAGES, NO_FREE_SOURCE } from "./coverage";
import { normalizeHuIdentifiers } from "./registry/hu-identifiers";

export interface OfficialPage {
  url: string;
  label: string;
  note: string;
  balanceUrl?: string | undefined;
  actionLabel?: string | undefined;
  mode?: "embed" | "external" | undefined;
  instructions?: string[] | undefined;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/&/g, " i ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLuxembourgRcs(value: string): string | undefined {
  const normalized = value.replace(/[\s.-]/g, "").toUpperCase();
  return /^B\d+$/.test(normalized) ? normalized : undefined;
}

function normalizePolandKrs(value: string): string | undefined {
  const normalized = value.replace(/\D/g, "");
  return /^\d{8}$/.test(normalized) || /^\d{10}$/.test(normalized)
    ? normalized.padStart(10, "0")
    : undefined;
}

function normalizeGreeceGemi(value: string): string | undefined {
  const normalized = value.replace(/\D/g, "");
  return /^\d{10}$/.test(normalized) ? normalized : undefined;
}

export function officialPageFor(
  iso: string,
  localVat: string,
  query: string,
): OfficialPage | undefined {
  const id = digits(localVat);
  const name = query.trim();
  const rawId = localVat.trim() || name;

  if (iso === "HU") {
    const huIds = normalizeHuIdentifiers({ vat: rawId, query: name });
    return {
      url: BROWSER_ONLY_PAGES["HU"]?.url ?? "https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses",
      label: "e-Beszámoló — Igazságügyi Minisztérium",
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note: "Il registro ungherese richiede una verifica anti-bot e non consente l'incorporamento della pagina: la ricerca e il download si completano nella scheda del registro.",
      instructions: [
        huIds.cegjegyzekszam
          ? `Inserisci il cégjegyzékszám ${huIds.cegjegyzekszam} nel campo “Cégjegyzékszám”.`
          : huIds.adoszam8
            ? `Inserisci le prime 8 cifre dell'adószám (${huIds.adoszam8}) nel campo “Adószám”.`
            : "Inserisci il cégjegyzékszám, l'adószám o almeno 4 caratteri della denominazione.",
        "Completa la verifica anti-bot e accetta le condizioni d'uso del portale.",
        "Premi “Keresés” e apri la società nell'elenco dei risultati.",
        "Scegli l'esercizio e scarica il beszámoló (PDF o allegato XML).",
      ],
    };
  }

  if (iso === "LU") {
    const luRcs = normalizeLuxembourgRcs(rawId);
    const url = luRcs
      ? `https://www.lbr.lu/mjrcs-web-front/consult-company/${luRcs}?tab=deposit`
      : "https://www.lbr.lu/mjrcs-web-front/";
    return {
      url,
      label: "LBR — Luxembourg Business Registers",
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note: "Il registro lussemburghese consente la ricerca gratuita, ma lo scarico dei conti annuali richiede un account gratuito (LuxTrust/eIDAS): la consultazione e il download si completano nella scheda della società sul portale ufficiale.",
      instructions: [
        luRcs
          ? `Apri la scheda della società con numero RCS ${luRcs} (sezione “Dépôts / Comptes annuels”).`
          : "Cerca la società per denominazione o numero RCS nel portale LBR.",
        "Accedi o crea un account gratuito LuxTrust/eIDAS quando richiesto per il download.",
        "Nella sezione “Comptes annuels” scegli l'esercizio desiderato.",
        "Scarica il documento ufficiale in formato PDF.",
      ],
    };
  }

  const grGemi = iso === "GR" ? normalizeGreeceGemi(rawId) : undefined;
  if (grGemi) {
    return {
      url: `https://publicity.businessportal.gr/company/${grGemi}`,
      label: "G.E.MI. — Publicity",
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note: "Apre direttamente la società nel portale ufficiale. Il portale può richiedere un CAPTCHA: la verifica va completata nel browser.",
    };
  }

  const plKrs = iso === "PL" ? normalizePolandKrs(rawId) : undefined;
  if (plKrs) {
    const companySlug = slugify(name);
    const url = companySlug
      ? `https://aleo.com/pl/firma/${companySlug}`
      : `https://aleo.com/pl/szukaj-firmy?krs=${plKrs}`;
    return {
      url,
      label: `ALEO — Sprawozdania finansowe KRS (${plKrs})`,
      actionLabel: "Apri i bilanci della società",
      mode: "external",
      note: `Pagina specifica della società associata al KRS ${plKrs}. ALEO espone pubblicamente la sezione “Sprawozdania finansowe” con i comandi “Pobierz pdf” e “Pobierz xml” quando il deposito è disponibile. I dati della società e dei depositi sono indicati come provenienti dal KRS.`,
      instructions: [
        `Verifica che il KRS ${plKrs} e la denominazione coincidano con la società cercata.`,
        "Nella sezione “Sprawozdania finansowe” seleziona l'esercizio desiderato.",
        "Premi “Pobierz pdf” per scaricare il bilancio.",
        "Per la fonte istituzionale primaria, verifica lo stesso deposito nel KRS/RDF del Ministero della Giustizia.",
      ],
    };
  }

  if (iso === "DK") {
    return {
      url: id
        ? `https://datacvr.virk.dk/enhed/virksomhed/${id}`
        : `https://datacvr.virk.dk/soegeresultater?fritekst=${encodeURIComponent(name)}&sideIndex=0&size=10`,
      label: "CVR — Erhvervsstyrelsen",
      actionLabel: "Apri bilancio",
      mode: "embed",
      note: "Apre la scheda della società nel registro danese, da cui è possibile aprire e scaricare l'årsrapport.",
    };
  }

  if (iso === "BE") {
    const cbe = id ? id.padStart(10, "0") : "";
    return {
      url: cbe
        ? `https://consult.cbso.nbb.be/consult-enterprise/${cbe}`
        : "https://consult.cbso.nbb.be/",
      label: "Centrale dei bilanci — Banca nazionale del Belgio",
      actionLabel: "Apri bilancio",
      mode: "embed",
      note: "Apre direttamente la scheda d'impresa NBB; da lì si accede ai conti annuali pubblicati.",
    };
  }

  if (iso === "EE") {
    // Deep-link alla scheda: la tabella "Annual reports" elenca i bilanci con
    // il pulsante PDF per ogni esercizio. Usato solo se il recupero
    // automatico non riesce; in caso contrario il documento è già in pagina.
    const code = /^\d{8}$/.test(id)
      ? id
      : /^\d{8}$/.test(name.replace(/\D/g, ""))
        ? name.replace(/\D/g, "")
        : undefined;
    return {
      url: code
        ? `https://ariregister.rik.ee/eng/company/${code}`
        : "https://ariregister.rik.ee/eng",
      label: "e-Äriregister — Centro dei registri (RIK)",
      actionLabel: "Apri bilancio",
      mode: "embed",
      note: code
        ? `Apre direttamente la scheda ${code} nel registro ufficiale: la tabella “Annual reports” elenca i bilanci depositati, con il pulsante PDF per scaricare ogni esercizio.`
        : "Apre il punto di consultazione ufficiale del registro da cui è possibile accedere al documento di bilancio.",
      ...(code
        ? {
            instructions: [
              "Scorri fino alla tabella “Annual reports”.",
              "Scegli l'esercizio e premi “PDF” per aprire il bilancio ufficiale.",
            ],
          }
        : {}),
    };
  }

  if (iso === "DE") {
    return {
      url: "https://www.unternehmensregister.de/ureg/",
      label: "Unternehmensregister",
      actionLabel: "Apri bilancio",
      mode: "embed",
      note: "Registro ufficiale tedesco per le pubblicazioni finanziarie.",
    };
  }

  const consult = CONSULT_PAGES[iso];
  if (consult) {
    return {
      url: consult.url,
      label: consult.label,
      actionLabel: "Apri bilancio",
      mode: "embed",
      note: "Apre il punto di consultazione ufficiale del registro da cui è possibile accedere al documento di bilancio.",
    };
  }

  if (NO_FREE_SOURCE[iso]) return undefined;
  return undefined;
}
