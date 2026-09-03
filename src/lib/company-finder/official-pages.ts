// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Le pagine che questo modulo propone derivano dalla macchina a stati di
// `document-access.ts`: la nota che l'utente legge è la PROVA della
// classificazione del paese, non un testo generico. Una pagina SOURCE_RESTRICTED
// porta sempre `mode: "external"` e le istruzioni operative: niente iframe
// sotto CAPTCHA o login, niente promesse che il tool non può mantenere.

import { documentAccessFor } from "./document-access";
import { normalizeHuIdentifiers } from "./registry/hu-identifiers";

export interface OfficialPage {
  url: string;
  label: string;
  note: string;
  /** URL diretto al documento di bilancio, quando verificabile. */
  balanceUrl?: string | undefined;
  /** Testo dell'azione primaria mostrata nel Company Finder. */
  actionLabel?: string | undefined;
  /**
   * "embed" → la pagina si può incorporare nel tool;
   * "external" → il registro rifiuta l'incorporamento o richiede un controllo
   * che va completato dalla persona: si apre in una nuova scheda.
   */
  mode?: "embed" | "external" | undefined;
  /** Passaggi operativi da compiere sul portale ufficiale. */
  instructions?: string[] | undefined;
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

  // ---- Ungheria: e-Beszámoló ------------------------------------------------
  // Verificato 2026-09-03: la ricerca è protetta da verifica anti-bot (ALTCHA
  // proof-of-work), le risposte portano X-Frame-Options: DENY e i parametri
  // b/so/o dei risultati sono legati alla sessione ASP.NET («Hibás
  // paraméterek!» fuori sessione). Non è incorporabile e non è automatizzabile:
  // si apre in una nuova scheda con i passaggi da compiere. Nessun parametro
  // di sessione del registro (b/so/o) viene costruito o riusato.
  if (iso === "HU") {
    const huIds = normalizeHuIdentifiers({ vat: rawId, query: name });
    return {
      url: access.consult?.url ?? "https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses",
      label: access.consult?.label ?? "e-Beszámoló — Igazságügyi Minisztérium",
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note:
        `${access.reason} ` +
        (access.bulk
          ? `Via residua per volumi — ${access.bulk.label}: ${access.bulk.note} (${access.bulk.url})`
          : ""),
      instructions: [
        huIds.cegjegyzekszam
          ? `Inserisci il cégjegyzékszám ${huIds.cegjegyzekszam} nel campo “Cégjegyzékszám”.`
          : huIds.adoszam8
            ? `Inserisci le prime 8 cifre dell'adószám (${huIds.adoszam8}) nel campo “Adószám”.`
            : huIds.name
              ? `Inserisci la denominazione “${huIds.name}” nel campo “Cégnév” (minimo 4 caratteri).`
              : "Inserisci il cégjegyzékszám, le prime 8 cifre dell'adószám o almeno 4 caratteri della denominazione.",
        "Completa la verifica anti-bot e accetta le condizioni d'uso del portale.",
        "Premi “Kereses” e apri la società nell'elenco dei risultati.",
        "Scegli l'esercizio e scarica il beszámoló (PDF o file OBR/XML). Gli URL dei risultati decadono con la sessione: salva subito il documento.",
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
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note: "Apre direttamente la società nel portale ufficiale, protetto da reCAPTCHA: la risoluzione del CAPTCHA e lo scaricamento del deposito avvengono manualmente nel browser. Quando il record contiene il link al singolo documento iXBRL, quello viene usato come destinazione primaria.",
    };
  }

  const plKrs = iso === "PL" ? normalizePolandKrs(rawId) : undefined;
  if (plKrs) {
    return {
      url: "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot",
      label: "RDF — Repozytorium Dokumentów Finansowych",
      actionLabel: "Apri il registro ufficiale",
      mode: "external",
      note: `Nel portale premi “Szukaj” e cerca il KRS ${plKrs}, seleziona il periodo effettivo del deposito e apri il documento “Roczne sprawozdanie finansowe”, quindi scaricalo con “Pobierz dokument”. Il tool non inventa l'anno del deposito e non scarica al posto tuo: il Repozytorium rifiuta le richieste da server.`,
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

  if (iso === "DE") {
    return {
      url: "https://www.unternehmensregister.de/ureg/",
      label: "Unternehmensregister",
      actionLabel: "Apri bilancio",
      mode: "embed",
      note: "Registro ufficiale tedesco per le pubblicazioni finanziarie.",
    };
  }

  if (access.consult) {
    const restricted = access.tier === "restricted";
    return {
      url: access.consult.url,
      label: access.consult.label,
      actionLabel: restricted ? "Apri il registro ufficiale" : "Apri la pagina ufficiale",
      mode: access.consult.browserOnly ? "external" : "embed",
      note: restricted
        ? `${access.reason} Il portale si apre in una nuova scheda: la ricerca e lo scaricamento del documento si completano lì, come persona.`
        : `${access.reason} Da questa pagina si raggiunge il documento di bilancio depositato.`,
    };
  }

  return undefined;
}
