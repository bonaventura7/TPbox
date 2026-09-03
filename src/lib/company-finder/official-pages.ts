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
// Tre registri, invece, NON vanno incorporati: si aprono in una nuova scheda
// (mode: "external"), perché autenticazione, CAPTCHA e sessione devono
// avvenire nel contesto principale del browser dell'utente:
//   LU — il portale LBR protegge alcuni servizi con LuxTrust/eID/eIDAS;
//   GR — publicity.businessportal.gr presenta verifiche reCAPTCHA;
//   PL — il portale RDF del Ministero della Giustizia richiede una sessione
//        interattiva (KRS → «Szukaj» → periodo → «Pobierz dokument»).
// Nessuna credenziale viene trasmessa né automatizzata: l'utente opera sul
// portale ufficiale esattamente come farebbe andandoci a mano.
//
// È il registro ufficiale, servito com'è, senza modifiche e con la fonte
// dichiarata: non una copia, non uno scraping.

import { CONSULT_PAGES, NO_FREE_SOURCE } from "./coverage";
import type { OfficialPageRef } from "./types";

export type OfficialPage = OfficialPageRef;

/** Solo cifre, per i registri che indicizzano per numero. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Numero RCS lussemburghese: lettera "B" seguita da cifre. Tollerante a
 * spazi, punti, trattini e a un eventuale prefisso "LU"; NON deriva mai un
 * RCS da una partita IVA (l'IVA lussemburghese è fatta di sole cifre).
 */
export function rcsFromInput(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/[\s.-]/g, "").toUpperCase();
  const m = compact.match(/^(?:LU)?B(\d{1,10})$/);
  return m ? `B${m[1]}` : undefined;
}

/**
 * Identificativo ΓΕΜΗ (pubblicità commerciale greca): esattamente 10 cifre.
 * L'IVA greca ha 9 cifre (prefisso EL): le due cose non vanno mai confuse,
 * e un identificativo ΓΕΜΗ non deve MAI essere inviato al VIES.
 */
export function gemiFromInput(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/[\s.-]/g, "");
  return /^\d{10}$/.test(compact) ? compact : undefined;
}

/**
 * Numero KRS polacco, normalizzato a 10 cifre per la sola visualizzazione.
 * Accetta 8 cifre (forma storica), 10 cifre inizianti per "0000" (forma
 * moderna) o il formato "KRS 0000028860" dei profili di registro. Dieci
 * cifre che non iniziano per "0000" sono un NIP, non un KRS.
 */
export function krsFromInput(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/[\s.-]/g, "").toUpperCase();
  const labelled = compact.match(/^KRS(\d{8}|\d{10})$/);
  if (labelled) return labelled[1]!.padStart(10, "0");
  if (/^\d{8}$/.test(compact)) return compact.padStart(10, "0");
  if (/^0000\d{6}$/.test(compact)) return compact;
  return undefined;
}

/**
 * Pagina di consultazione ufficiale del paese: per numero quando lo si ha,
 * altrimenti la ricerca per denominazione già compilata. `registryId` è
 * l'identificativo di registro risolto dalle fonti (es. `KRS 0000028860`,
 * `B60814`), quando la scheda società lo espone.
 */
export function officialPageFor(
  iso: string,
  localVat: string,
  query: string,
  registryId?: string,
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
      mode: "embed",
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
      mode: "embed",
      note: "I conti annuali belgi sono gratuiti ma la loro API rifiuta le chiamate da server: la pagina ufficiale della NBB è caricata qui dal tuo browser.",
    };
  }
  if (iso === "DE") {
    return {
      url: "https://www.unternehmensregister.de/ureg/",
      label: "Unternehmensregister",
      mode: "embed",
      note: "Registro ufficiale tedesco, per le pubblicazioni che la ricerca automatica non intercetta.",
    };
  }

  // ---- Lussemburgo: scheda LBR diretta (sezione depositi) quando l'RCS è noto ----
  // Il portale LBR protegge alcuni servizi con autenticazione (LuxTrust, eID,
  // eIDAS): la pagina si apre nel browser dell'utente, che si autentica da sé.
  if (iso === "LU") {
    const rcs = rcsFromInput(registryId) ?? rcsFromInput(localVat);
    return {
      url: rcs
        ? `https://www.lbr.lu/mjrcs-web-front/consult-company/${rcs}?tab=deposit`
        : "https://www.lbr.lu/mjrcs-web-front/",
      label: "LBR — Registre de commerce et des sociétés",
      mode: "external",
      note: rcs
        ? `Il collegamento apre la scheda ufficiale della società (RCS ${rcs}) sul portale LBR, direttamente sulla sezione dei depositi, dove si trovano i conti annuali.`
        : "Il collegamento apre il portale ufficiale LBR, dove cercare la società per denominazione o per numero RCS (lettera B seguita da cifre, es. B60814).",
      instructions: [
        rcs
          ? `La scheda RCS ${rcs} si apre già sulla sezione dei depositi: individua i conti annuali nell'elenco dei documenti depositati.`
          : "Cerca la società per denominazione o numero RCS (es. B60814) e apri la sezione dei depositi.",
        "Per i servizi protetti il portale LBR può richiedere l'autenticazione (LuxTrust, eID o eIDAS): la completi tu, direttamente sul portale ufficiale. Questa applicazione non effettua alcun accesso per tuo conto.",
      ],
    };
  }

  // ---- Grecia: scheda ΓΕΜΗ diretta quando l'identificativo a 10 cifre è noto ----
  if (iso === "GR") {
    const gemi = gemiFromInput(registryId) ?? gemiFromInput(localVat);
    return {
      url: gemi
        ? `https://publicity.businessportal.gr/company/${gemi}`
        : "https://publicity.businessportal.gr/",
      label: "ΓΕΜΗ — Registro generale del commercio",
      mode: "external",
      note: gemi
        ? `Il collegamento apre direttamente la scheda della società (ΓΕΜΗ ${gemi}) sul portale ufficiale di pubblicità commerciale.`
        : "Il collegamento apre il portale ufficiale ΓΕΜΗ, dove cercare la società; l'identificativo ΓΕΜΗ è un numero di 10 cifre.",
      instructions: [
        gemi
          ? `La pagina della società (ΓΕΜΗ ${gemi}) si apre direttamente sul portale ufficiale.`
          : "Cerca la società per denominazione, oppure inserisci l'identificativo ΓΕΜΗ (10 cifre) nel campo del numero per arrivare alla scheda diretta.",
        "Dalla scheda si scaricano le pubblicazioni con i bilanci (Οικονομικές Καταστάσεις).",
        "Se il portale presenta un CAPTCHA o un'altra verifica del browser, la completi tu sul sito ufficiale.",
      ],
    };
  }

  // ---- Polonia: portale RDF del Ministero della Giustizia ----
  // Il repository dei documenti finanziari si consulta in modo interattivo:
  // nessun parametro di ricerca in URL è documentato, quindi non se ne inventano.
  if (iso === "PL") {
    const krs = krsFromInput(registryId) ?? krsFromInput(localVat);
    return {
      url: "https://rdf-przegladarka.ms.gov.pl/wyszukaj-podmiot",
      label: "KRS — Repozytorium Dokumentów Finansowych",
      mode: "external",
      note: "Le sprawozdania finansowe depositate in KRS sono pubbliche e gratuite sul portale RDF del Ministero della Giustizia polacco: la consultazione avviene nel tuo browser, sul portale ufficiale.",
      instructions: [
        krs
          ? `Inserisci il numero KRS ${krs} nel campo «KRS» e premi «Szukaj».`
          : "Inserisci il numero KRS (10 cifre) nel campo «KRS» e premi «Szukaj».",
        "Seleziona il periodo di rendicontazione richiesto tra quelli elencati per la società.",
        "Scegli «Roczne sprawozdanie finansowe» (il fascicolo annuale completo, non il solo «Bilans») e usa «Pobierz dokument» per scaricarlo.",
      ],
    };
  }

  const consult = CONSULT_PAGES[iso];
  if (consult) {
    return {
      url: consult.url,
      label: consult.label,
      mode: "embed",
      note: "Il bilancio è pubblico e gratuito, ma il registro non risponde alle chiamate da server: la sua pagina ufficiale è caricata qui dal tuo browser, da cui si scarica il documento.",
    };
  }

  const paywall = NO_FREE_SOURCE[iso];
  if (paywall) {
    return undefined; // paese non coperto: la nota viene data dall'orchestratore
  }
  return undefined;
}
