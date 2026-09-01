// ---------- Consultazione ufficiale nel browser dell'utente ----------
// Alcuni registri rispondono soltanto a un browser vero: datacvr.virk.dk e
// consult.cbso.nbb.be sono dietro una sfida che un server non supera (403 da
// qualunque IP, verificato). Proxarli è impossibile — ma incorporarli sì.
//
// Se la pagina ufficiale viaggia nell'iframe, è il browser DELL'UTENTE a
// caricarla: la sfida la supera lui, come quando ci va a mano. Verificato in
// Chrome che datacvr.virk.dk, consult.cbso.nbb.be e unternehmensregister.de
// consentono di essere incorporati (nessun X-Frame-Options che li blocchi).
//
// È il registro ufficiale, servito com'è, senza modifiche e con la fonte
// dichiarata: non una copia, non uno scraping.

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
    return undefined; // paese non coperto: la nota viene data dall'orchestratore
  }
  return undefined;
}
