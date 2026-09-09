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

  if (iso === "AT") {
    return {
      url: BROWSER_ONLY_PAGES["AT"]?.url ?? "https://openfirmenbuch.at/",
      label: "OpenFirmenbuch — dati ufficiali Firmenbuch (BMJ, CC-BY)",
      actionLabel: "Apri la consultazione gratuita",
      mode: "external",
      note: "Da marzo 2025 i dati del Firmenbuch, bilanci inclusi, sono High Value Dataset (reg. UE 2023/138) sotto licenza CC-BY: questa pagina gratuita legge l'API ufficiale JustizOnline e restituisce il Jahresabschluss in PDF senza account né pagamento.",
      instructions: [
        name
          ? `Cerca la società per denominazione: “${name}”.`
          : "Cerca la società per denominazione (Firmenwortlaut) o per Firmenbuchnummer (FN).",
        "Apri la scheda della società: nella sezione documenti trovi Jahresabschlüsse e Lageberichte.",
        "Scarica il PDF dell'esercizio che ti serve: è gratuito e senza registrazione.",
        "Per uso automatico: la stessa fonte è disponibile via API ufficiale HVD di JustizOnline con chiave gratuita (justizonline.gv.at/jop/web/iwg/register).",
      ],
    };
  }

  if (iso === "SE") {
    const seDigits = digits(rawId);
    const orgnr =
      seDigits.length === 12
        ? seDigits.slice(0, 10) // IVA SE: orgnr (10 cifre) + suffisso "01"
        : seDigits.length === 10
          ? seDigits
          : undefined;
    return {
      url: BROWSER_ONLY_PAGES["SE"]?.url ?? "https://allaarsredovisningar.se/",
      label: "Allaårsredovisningar — årsredovisningar ufficiali Bolagsverket",
      actionLabel: "Apri la consultazione gratuita",
      mode: "external",
      note: "L'årsredovisning di Bolagsverket resta a tariffa sul canale ufficiale (ca. 100 SEK), ma questi stessi documenti ufficiali si scaricano qui in PDF, gratis e senza account.",
      instructions: [
        orgnr
          ? `Cerca per organisationsnummer ${orgnr} (le 10 cifre centrali della partita IVA svedese) o per nome.`
          : name
            ? `Cerca per nome (“${name}”) o per organisationsnummer (10 cifre).`
            : "Cerca per nome o per organisationsnummer (10 cifre: le cifre centrali della partita IVA SE, senza il suffisso 01 finale).",
        "Apri la società e scegli l'esercizio dall'elenco dei documenti ufficiali.",
        "Premi il comando di download: il PDF dell'årsredovisning è gratuito.",
      ],
    };
  }

  const luRcs = iso === "LU" ? normalizeLuxembourgRcs(rawId) : undefined;
  if (luRcs) {
    return {
      url: `https://www.lbr.lu/mjrcs-web-front/consult-company/${luRcs}?tab=deposit`,
      label: "LBR — Luxembourg Business Registers",
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note: "Apre direttamente la sezione depositi della società nel registro ufficiale: i documenti depositati, comptes annuels inclusi, si aprono gratuitamente dall'icona PDF del fascicolo. Restano a pagamento solo gli estratti RCS e le copie autenticate (portale europeo e-Justice).",
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
