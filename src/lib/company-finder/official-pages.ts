// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Alcuni registri rispondono soltanto a un browser vero: datacvr.virk.dk e
// consult.cbso.nbb.be sono dietro una sfida che un server non supera (403 da
// qualunque IP, verificato). Proxarli è impossibile — ma incorporarli sì.
//
// Lussemburgo, Grecia e Polonia richiedono invece una consultazione in una
// scheda browser dedicata: autenticazione, CAPTCHA e sessione devono rimanere
// nel contesto ufficiale del registro e non vengono mai automatizzati dal tool.

import { CONSULT_PAGES, NO_FREE_SOURCE } from "./coverage";

export interface OfficialPage {
  url: string;
  label: string;
  note: string;
}

/** Solo cifre, per i registri che indicizzano per numero. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** RCS lussemburghese: lettera B seguita dalle cifre, senza inventare il codice. */
function normalizeLuxembourgRcs(value: string): string | undefined {
  const normalized = value.replace(/[\s.-]/g, "").toUpperCase();
  return /^B\d+$/.test(normalized) ? normalized : undefined;
}

/** KRS polacco: il registro accetta normalmente 8 cifre; per istruzioni lo mostriamo a 10. */
function normalizePolandKrs(value: string): string | undefined {
  const normalized = value.replace(/\D/g, "");
  return /^\d{8}$/.test(normalized) || /^\d{10}$/.test(normalized)
    ? normalized.padStart(10, "0")
    : undefined;
}

/** G.E.MI. / company-publicity id greco: 10 cifre. */
function normalizeGreeceGemi(value: string): string | undefined {
  const normalized = value.replace(/\D/g, "");
  return /^\d{10}$/.test(normalized) ? normalized : undefined;
}

/**
 * Pagina di consultazione ufficiale del paese: per numero quando lo si ha,
 * altrimenti la ricerca per denominazione già compilata.
 */
export function officialPageFor(
  iso: string,
  localVat: string,
  query: string,
): OfficialPage | undefined {
  const id = digits(localVat);
  const name = query.trim();
  const rawId = localVat.trim() || name;

  // Lussemburgo: il deposito è sulla scheda impresa del LBR.
  const luRcs = iso === "LU" ? normalizeLuxembourgRcs(rawId) : undefined;
  if (luRcs) {
    return {
      url: `https://www.lbr.lu/mjrcs-web-front/consult-company/${luRcs}?tab=deposit`,
      label: "LBR — Luxembourg Business Registers",
      note:
        "Apri la scheda LBR in una nuova scheda: per accedere ai depositi il registro può richiedere l'autenticazione. Il login va eseguito normalmente nel portale ufficiale; il tool non gestisce credenziali o sessioni.",
    };
  }

  // Grecia: GEMI/publicity usa un identificativo societario a 10 cifre.
  const grGemi = iso === "GR" ? normalizeGreeceGemi(rawId) : undefined;
  if (grGemi) {
    return {
      url: `https://publicity.businessportal.gr/company/${grGemi}`,
      label: "G.E.MI. — Publicity",
      note:
        "La scheda G.E.MI. viene aperta direttamente nel portale ufficiale. Se compare CAPTCHA o un'altra verifica del browser, completala lì: il tool non tenta di aggirarla.",
    };
  }

  // Polonia: niente query string inventate; il documento si seleziona nel RDF.
  const plKrs = iso === "PL" ? normalizePolandKrs(rawId) : undefined;
  if (plKrs) {
    return {
      url: "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot",
      label: "RDF — Repozytorium Dokumentów Finansowych",
      note:
        `Inserisci KRS ${plKrs} e premi “Szukaj”. Seleziona il periodo richiesto, quindi il documento “Roczne sprawozdanie finansowe” e infine “Pobierz dokument” (o l'icona di download). Per ogni società va scelto il periodo effettivo del deposito; il tool non presume l'anno.` ,
    };
  }

  // Danimarca e Belgio hanno un indirizzo diretto per numero: ci si arriva
  // sulla scheda giusta invece che sulla home del registro.
  if (iso === "DK") {
    return {
      url: id
        ? `https://datacvr.virk.dk/enhed/virksomhed/${id}`
        : `https://datacvr.virk.dk/soegeresultater?fritekst=${encodeURIComponent(name)}&sideIndex=0&size=10`,
      label: "CVR — Erhvervsstyrelsen",
      note: "Il registro danese risponde solo a un browser: la sua pagina ufficiale è caricata qui dal tuo browser. Da lì si scarica l'årsrapport.",
    };
  }
  if (iso === "BE") {
    const cbe = id ? id.padStart(10, "0") : "";
    return {
      url: cbe
        ? `https://consult.cbso.nbb.be/consult-enterprise/${cbe}`
        : "https://consult.cbso.nbb.be/",
      label: "Centrale dei bilanci — Banca nazionale del Belgio",
      note: "I conti annuali belgi sono gratuiti ma la loro API rifiuta le chiamate da server: la pagina ufficiale della NBB è caricata qui dal tuo browser.",
    };
  }
  if (iso === "DE") {
    return {
      url: "https://www.unternehmensregister.de/ureg/",
      label: "Unternehmensregister",
      note: "Registro ufficiale tedesco, per le pubblicazioni che la ricerca automatica non intercetta.",
    };
  }

  const consult = CONSULT_PAGES[iso];
  if (consult) {
    return {
      url: consult.url,
      label: consult.label,
      note: "Il bilancio è pubblico e gratuito, ma il registro non risponde alle chiamate da server: la sua pagina ufficiale è caricata qui dal tuo browser, da cui si scarica il documento.",
    };
  }

  const paywall = NO_FREE_SOURCE[iso];
  if (paywall) {
    return undefined;
  }
  return undefined;
}
