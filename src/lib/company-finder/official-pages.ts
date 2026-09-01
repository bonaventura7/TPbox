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

  switch (iso) {
    case "DK": {
      const url = id
        ? `https://datacvr.virk.dk/enhed/virksomhed/${id}`
        : `https://datacvr.virk.dk/soegeresultater?fritekst=${encodeURIComponent(name)}&sideIndex=0&size=10`;
      return {
        url,
        label: "CVR — Erhvervsstyrelsen",
        note: "Il registro danese risponde solo a un browser: la sua pagina ufficiale è caricata qui dal tuo browser. Da lì si scarica l'årsrapport.",
      };
    }
    case "BE": {
      const cbe = id.padStart(10, "0");
      const url = id
        ? `https://consult.cbso.nbb.be/consult-enterprise/${cbe}`
        : "https://consult.cbso.nbb.be/";
      return {
        url,
        label: "Centrale dei bilanci — Banca nazionale del Belgio",
        note: "I conti annuali belgi sono gratuiti ma la loro API rifiuta le chiamate da server: la pagina ufficiale della NBB è caricata qui dal tuo browser.",
      };
    }
    case "DE":
      return {
        url: "https://www.unternehmensregister.de/ureg/",
        label: "Unternehmensregister",
        note: "Registro ufficiale tedesco, per confronto o per le pubblicazioni che la ricerca automatica non intercetta.",
      };
    case "LU":
      return {
        url: id
          ? `https://www.lbr.lu/mjrcs-web-front/entities/${id}`
          : "https://www.lbr.lu/mjrcs-web-front/",
        label: "LBR — Registre de commerce et des sociétés",
        note: "La consultazione dei conti depositati è gratuita ma il portale non risponde ai server: si apre qui nel tuo browser.",
      };
    case "IT":
      return {
        url: "https://italy.registroimprese.it/",
        label: "Registro Imprese",
        note: "I bilanci italiani sono depositati presso le CCIAA e non sono gratuiti: la pagina ufficiale è qui per la consultazione diretta.",
      };
    case "ES":
      return {
        url: name
          ? `https://www.cnmv.es/portal/consultas/busquedaporentidad.aspx`
          : "https://www.cnmv.es/",
        label: "CNMV — Informes financieros anuales",
        note: "Per le società quotate i conti annuali auditati sono gratuiti sul portale CNMV.",
      };
    default:
      return undefined;
  }
}
