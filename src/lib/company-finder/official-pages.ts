// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Alcuni registri richiedono un browser reale o una sessione ufficiale.

import { CONSULT_PAGES, NO_FREE_SOURCE } from "./coverage";
import { normalizeGemi } from "./greece";

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

/**
 * ΓΕΜΗ nella forma usata negli URL pubblici del portale (senza zeri iniziali).
 * Il numero canonico è a 12 cifre; il portale accetta anche la scrittura
 * compatta a 10-11 cifre. Un ΑΦΜ (9 cifre) non è un ΓΕΜΗ e viene rifiutato.
 */
function normalizeGreeceGemi(value: string): string | undefined {
  return normalizeGemi(value)?.gemi;
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
    // Il ΓΕΜΗ a 12 cifre è l'identificativo canonico; il portale accetta anche
    // la forma compatta. Il deep-link al singolo documento non si costruisce:
    // l'id del deposito lo pubblica solo il registro.
    return {
      url: `https://publicity.businessportal.gr/company/${grGemi}`,
      label: "ΓΕΜΗ — Publicity",
      actionLabel: "Apri bilancio",
      note: "Apre la scheda della società nel portale ufficiale ΓΕΜΗ. La ricerca del portale è protetta da un CAPTCHA, quindi questa consultazione avviene nel browser dell'utente; quando invece il server riesce a leggere il documento depositato, il bilancio viene aperto e scaricato direttamente da questa pagina, con un clic.",
    };
  }

  const plKrs = iso === "PL" ? normalizePolandKrs(rawId) : undefined;
  if (plKrs) {
    return {
      url: "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot",
      label: "RDF — Repozytorium Dokumentów Finansowych",
      actionLabel: "Apri bilancio",
      note: `Cerca KRS ${plKrs} con il pulsante “Szukaj”, apri il periodo effettivo e quindi la voce “Roczne sprawozdanie finansowe”: il file si ottiene con “Pobierz dokument”. Il tool non inventa l'anno del deposito.`,
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
