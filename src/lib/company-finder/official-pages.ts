// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Le pagine che questo modulo propone derivano dalla macchina a stati di
// `document-access.ts`: la nota che l'utente legge è la PROVA della
// classificazione del paese, non un testo generico. Nessuna pagina promette
// il documento quando il documento non è consegnabile dal tool.

import { documentAccessFor } from "./document-access";

export interface OfficialPage {
  url: string;
  label: string;
  note: string;
  /** URL diretto al documento di bilancio, quando verificabile. */
  balanceUrl?: string | undefined;
  /** Testo dell'azione primaria mostrata nel Company Finder. */
  actionLabel?: string | undefined;
  /**
   * true = non incorporare in iframe: la pagina esige interazione umana
   * (CAPTCHA, login) o rifiuta l'embedding. Si offre solo il link.
   */
  browserOnly?: boolean | undefined;
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
  const access = documentAccessFor(iso);

  if (!access || access.tier === "registry") return undefined;

  const luRcs = iso === "LU" ? normalizeLuxembourgRcs(rawId) : undefined;
  if (luRcs) {
    return {
      url: `https://www.lbr.lu/mjrcs-web-front/consult-company/${luRcs}?tab=deposit`,
      label: "LBR — Luxembourg Business Registers",
      actionLabel: "Apri la scheda depositi",
      browserOnly: true,
      note: "Apre direttamente la sezione depositi della società nel registro ufficiale. Se il deposito richiede autenticazione, la procedura prosegue nel portale LBR: completala lì, il tool non interviene.",
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
      actionLabel: "Apri la scheda G.E.MI.",
      browserOnly: true,
      note: "Apre direttamente la società nel portale ufficiale, protetto da reCAPTCHA: la risoluzione del CAPTCHA e lo scaricamento del deposito avvengono manualmente nel browser. Quando il record contiene il link al singolo documento iXBRL, quello viene usato come destinazione primaria.",
    };
  }

  const plKrs = iso === "PL" ? normalizePolandKrs(rawId) : undefined;
  if (plKrs) {
    return {
      url: "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot",
      label: "RDF — Repozytorium Dokumentów Finansowych",
      actionLabel: "Apri il Repozytorium",
      browserOnly: true,
      note: `Nel portale premi “Szukaj” e cerca il KRS ${plKrs}, seleziona il periodo effettivo del deposito e apri il documento “Roczne sprawozdanie finansowe”, quindi scaricalo con “Pobierz dokument”. Il tool non inventa l'anno del deposito e non scarica al posto tuo: il Repozytorium rifiuta le richieste da server.`,
    };
  }

  if (iso === "HU") {
    return {
      url: access.consult?.url ?? "https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses",
      label: access.consult?.label ?? "e-Beszámoló — Ministero della Giustizia (HU)",
      actionLabel: "Apri il portale ufficiale",
      browserOnly: true,
      note:
        `${access.reason} ` +
        (access.bulk ? `${access.bulk.label}: ${access.bulk.note} (${access.bulk.url})` : ""),
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

  if (access.consult) {
    const restricted = access.tier === "restricted";
    return {
      url: access.consult.url,
      label: access.consult.label,
      actionLabel: restricted ? "Apri il portale ufficiale" : "Apri la pagina ufficiale",
      browserOnly: access.consult.browserOnly,
      note: restricted
        ? `${access.reason} Il portale si apre in una nuova scheda: la ricerca e lo scaricamento del documento si completano lì, come persona.`
        : `${access.reason} Da questa pagina si raggiunge il documento di bilancio depositato.`,
    };
  }

  return undefined;
}
