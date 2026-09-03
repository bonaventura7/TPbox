// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Alcuni registri richiedono un browser reale o una sessione ufficiale.

import { CONSULT_PAGES, NO_FREE_SOURCE } from "./coverage";

export interface OfficialPage {
  url: string;
  label: string;
  note: string;
  /** URL diretto al documento di bilancio, quando verificabile. */
  balanceUrl?: string | undefined;
  /** Testo dell'azione primaria mostrata nel Company Finder. */
  actionLabel?: string | undefined;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
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

  const luRcs = iso === "LU" ? normalizeLuxembourgRcs(rawId) : undefined;
  if (luRcs) {
    return {
      url: `https://www.lbr.lu/mjrcs-web-front/consult-company/${luRcs}?tab=deposit`,
      label: "LBR — Luxembourg Business Registers",
      actionLabel: "Apri bilancio",
      note: "Apre direttamente la sezione depositi della società nel registro ufficiale. Se il deposito richiede autenticazione, la procedura prosegue sul portale LBR.",
    };
  }

  const grGemi = iso === "GR" ? normalizeGreeceGemi(rawId) : undefined;
  if (grGemi) {
    // L'identificativo della società G.E.MI. e quello del filing iXBRL sono
    // distinti. Il deep-link al filing viene costruito solo quando il provider
    // restituisce esplicitamente il document URL; non inventiamo un UUID.
    return {
      url: `https://publicity.businessportal.gr/company/${grGemi}`,
      label: "G.E.MI. — Publicity",
      actionLabel: "Apri bilancio",
      note: "Apre direttamente la società nel portale ufficiale. Quando il record contiene il link al singolo documento iXBRL, quello viene usato come destinazione primaria.",
    };
  }

  const plKrs = iso === "PL" ? normalizePolandKrs(rawId) : undefined;
  if (plKrs) {
    return {
      url: "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot",
      label: "RDF — Repozytorium Dokumentów Finansowych",
      actionLabel: "Apri bilancio",
      note: `Cerca KRS ${plKrs}, seleziona il periodo effettivo e quindi “Roczne sprawozdanie finansowe”. Il tool non inventa l'anno del deposito.`,
    };
  }

  if (iso === "DK") {
    return {
      url: id
        ? `https://datacvr.virk.dk/enhed/virksomhed/${id}`
        : `https://datacvr.virk.dk/soegeresultater?fritekst=${encodeURIComponent(name)}&sideIndex=0&size=10`,
      label: "CVR — Erhvervsstyrelsen",
      actionLabel: "Apri bilancio",
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
      note: "Apre direttamente la scheda d'impresa NBB; da lì si accede ai conti annuali pubblicati.",
    };
  }

  if (iso === "DE") {
    return {
      url: "https://www.unternehmensregister.de/ureg/",
      label: "Unternehmensregister",
      actionLabel: "Apri bilancio",
      note: "Registro ufficiale tedesco per le pubblicazioni finanziarie.",
    };
  }

  const consult = CONSULT_PAGES[iso];
  if (consult) {
    return {
      url: consult.url,
      label: consult.label,
      actionLabel: "Apri bilancio",
      note: "Apre il punto di consultazione ufficiale del registro da cui è possibile accedere al documento di bilancio.",
    };
  }

  if (NO_FREE_SOURCE[iso]) return undefined;
  return undefined;
}
