import { INTERPELLI_SOURCE_URL, type InterpelloRecord } from "./interpelli";

/**
 * Archivio dimostrativo: numeri, titoli, abstract e sintesi sono redazionali e
 * sintetici, non riproducono documenti reali. In assenza di un documento
 * verificato, il collegamento punta alla pagina ufficiale dell'Agenzia delle
 * Entrate: nessun URL di PDF specifico viene ipotizzato.
 */
function record(
  input: Omit<
    InterpelloRecord,
    "sourceName" | "sourceType" | "isDemo" | "officialUrl" | "year"
  >,
): InterpelloRecord {
  return {
    ...input,
    year: Number(input.publicationDate.slice(0, 4)),
    officialUrl: INTERPELLI_SOURCE_URL,
    sourceName: "Agenzia delle Entrate",
    sourceType: "ISTITUZIONALE",
    isDemo: true,
  };
}

export const DEMO_INTERPELLI: InterpelloRecord[] = [
  record({
    id: "int-2026-014",
    number: "14/2026",
    publicationDate: "2026-06-18",
    title: "Metodo più appropriato nelle cessioni infragruppo di semilavorati",
    abstract:
      "Sintesi redazionale sulla scelta del metodo di determinazione dei prezzi quando la società italiana svolge funzioni produttive a rischio limitato.",
    subject: "internazionale-tp",
    subSubject: "Transfer pricing",
    tags: ["metodi", "comparabili", "cessioni infragruppo"],
    legalReferences: ["art. 110, comma 7, TUIR", "Linee guida OCSE, cap. II"],
    lastVerifiedAt: "2026-07-30",
    workflowStatus: "PUBLISHED",
    question:
      "Quale metodo va considerato più appropriato per remunerare una società produttrice che opera su specifiche della capogruppo con rischi contrattualmente limitati.",
    answerSummary:
      "Sintesi dimostrativa: il metodo va scelto in coerenza con l'analisi funzionale e con la disponibilità di comparabili affidabili, motivando l'esclusione delle alternative.",
    relatedTopics: ["Analisi funzionale", "Documentazione", "Comparabili"],
  }),
  record({
    id: "int-2026-009",
    number: "9/2026",
    publicationDate: "2026-04-02",
    title: "Documentazione idonea ed effetti sulle sanzioni amministrative",
    abstract:
      "Nota sintetica sui requisiti formali della documentazione sui prezzi di trasferimento e sugli effetti in materia sanzionatoria.",
    subject: "internazionale-tp",
    subSubject: "Transfer pricing",
    tags: ["documentazione", "penalty protection", "masterfile"],
    legalReferences: ["art. 1, comma 6, d.lgs. 471/1997", "art. 110, comma 7, TUIR"],
    lastVerifiedAt: "2026-07-30",
    workflowStatus: "PUBLISHED",
    question:
      "Se una documentazione predisposta con struttura semplificata consenta di beneficiare del regime premiale in caso di rettifica.",
    answerSummary:
      "Sintesi dimostrativa: la struttura documentale deve essere completa e coerente con le operazioni descritte, con data certa entro i termini previsti.",
    relatedTopics: ["Masterfile", "Documentazione nazionale", "Sanzioni"],
  }),
  record({
    id: "int-2026-004",
    number: "4/2026",
    publicationDate: "2026-02-11",
    title: "Fatturazione elettronica nelle operazioni con controparti non residenti",
    abstract:
      "Sintesi degli adempimenti di trasmissione dei dati per le operazioni transfrontaliere e dei termini di invio.",
    subject: "iva-indirette",
    subSubject: "Fatturazione elettronica",
    tags: ["fatturazione elettronica", "esterometro", "adempimenti"],
    legalReferences: ["art. 1, comma 3-bis, d.lgs. 127/2015"],
    lastVerifiedAt: "2026-07-30",
    workflowStatus: "PUBLISHED",
    question:
      "Come vanno trasmessi i dati delle operazioni ricevute da un fornitore estero senza stabile organizzazione in Italia.",
    answerSummary:
      "Sintesi dimostrativa: la trasmissione segue i termini ordinari collegati alla registrazione dell'operazione, con codici documento coerenti alla natura dell'acquisto.",
    relatedTopics: ["Adempimenti IVA", "Operazioni con l'estero"],
  }),
  record({
    id: "int-2025-221",
    number: "221/2025",
    publicationDate: "2025-11-12",
    title: "Stabile organizzazione occulta e attribuzione del reddito d'impresa",
    abstract:
      "Ricostruzione sintetica dei criteri di attribuzione del reddito a una presenza economica stabile nel territorio dello Stato.",
    subject: "internazionale-tp",
    subSubject: "Stabile organizzazione",
    tags: ["stabile organizzazione", "attribuzione del reddito"],
    legalReferences: ["art. 162 TUIR", "art. 5 Modello OCSE"],
    lastVerifiedAt: "2026-07-30",
    workflowStatus: "PUBLISHED",
    question:
      "Se l'attività svolta in Italia da personale di una società estera configuri una presenza stabile rilevante ai fini fiscali.",
    answerSummary:
      "Sintesi dimostrativa: rilevano la stabilità della presenza e le funzioni effettivamente esercitate; il reddito è attribuito secondo il principio di libera concorrenza.",
    relatedTopics: ["Transfer pricing", "Convenzioni", "Analisi funzionale"],
  }),
  record({
    id: "int-2025-198",
    number: "198/2025",
    publicationDate: "2025-09-24",
    title: "Ritenute su royalties corrisposte a beneficiario residente in Stato convenzionato",
    abstract:
      "Nota dimostrativa sull'applicazione dell'aliquota convenzionale e sulla prova della residenza del beneficiario effettivo.",
    subject: "internazionale-tp",
    subSubject: "Ritenute transfrontaliere",
    tags: ["royalties", "convenzioni", "beneficiario effettivo"],
    legalReferences: ["art. 25, comma 4, d.P.R. 600/1973", "art. 12 Modello OCSE"],
    lastVerifiedAt: "2026-06-15",
    workflowStatus: "PUBLISHED",
    question:
      "Quali elementi occorrono per applicare direttamente l'aliquota convenzionale sulle royalties in uscita.",
    answerSummary:
      "Sintesi dimostrativa: occorre acquisire una certificazione di residenza e verificare la condizione di beneficiario effettivo prima del pagamento.",
    relatedTopics: ["Convenzioni", "Beneficiario effettivo"],
  }),
  record({
    id: "int-2025-176",
    number: "176/2025",
    publicationDate: "2025-08-06",
    title: "Deducibilità degli interessi passivi su finanziamenti infragruppo",
    abstract:
      "Esemplificazione redazionale del calcolo del limite di deducibilità e del riporto delle eccedenze.",
    subject: "reddito-impresa",
    subSubject: "Determinazione della base imponibile",
    tags: ["interessi passivi", "ROL", "finanziamenti"],
    legalReferences: ["art. 96 TUIR"],
    lastVerifiedAt: "2026-05-20",
    workflowStatus: "PUBLISHED",
    question:
      "Come determinare il limite di deducibilità degli interessi in presenza di finanziamenti erogati dalla capogruppo estera.",
    answerSummary:
      "Sintesi dimostrativa: il limite si calcola sul risultato operativo lordo di competenza, con riporto delle eccedenze nei periodi successivi.",
    relatedTopics: ["Transfer pricing finanziario", "ROL"],
  }),
  record({
    id: "int-2025-140",
    number: "140/2025",
    publicationDate: "2025-06-11",
    title: "Territorialità delle prestazioni di servizi rese a committente estero",
    abstract:
      "Sintesi sui criteri di territorialità e sugli adempimenti documentali nelle prestazioni verso soggetti non residenti.",
    subject: "iva-indirette",
    subSubject: "Operazioni con l'estero",
    tags: ["territorialità", "servizi", "reverse charge"],
    legalReferences: ["art. 7-ter d.P.R. 633/1972"],
    lastVerifiedAt: "2026-05-20",
    workflowStatus: "PUBLISHED",
    question:
      "Quale trattamento IVA si applica a un servizio di consulenza reso a una società stabilita in altro Stato.",
    answerSummary:
      "Sintesi dimostrativa: rileva lo status del committente; l'operazione è documentata fuori campo con indicazione della norma applicata.",
    relatedTopics: ["Adempimenti IVA", "Reverse charge"],
  }),
  record({
    id: "int-2025-088",
    number: "88/2025",
    publicationDate: "2025-04-08",
    title: "Regime agevolativo per lavoratori impatriati e distacco infragruppo",
    abstract:
      "Esemplificazione dei presupposti dell'agevolazione in caso di rientro a seguito di distacco internazionale.",
    subject: "lavoro-dipendente",
    subSubject: "Regimi agevolativi per impatriati",
    tags: ["impatriati", "distacco", "residenza fiscale"],
    legalReferences: ["art. 5 d.lgs. 209/2023"],
    lastVerifiedAt: "2026-04-02",
    workflowStatus: "PUBLISHED",
    question:
      "Se il rientro presso la medesima società del gruppo consenta l'accesso al regime agevolativo.",
    answerSummary:
      "Sintesi dimostrativa: rilevano la durata della permanenza all'estero e la discontinuità dell'attività lavorativa rispetto al periodo precedente.",
    relatedTopics: ["Mobilità internazionale", "Residenza fiscale"],
  }),
  record({
    id: "int-2024-302",
    number: "302/2024",
    publicationDate: "2024-12-03",
    title: "Conferimento di ramo d'azienda e continuità dei valori fiscali",
    abstract:
      "Ricostruzione sintetica degli effetti fiscali del conferimento e della successiva cessione delle partecipazioni.",
    subject: "reddito-impresa",
    subSubject: "Operazioni straordinarie",
    tags: ["conferimento", "ramo d'azienda", "neutralità"],
    legalReferences: ["art. 176 TUIR", "art. 87 TUIR"],
    lastVerifiedAt: "2026-03-11",
    workflowStatus: "PUBLISHED",
    question:
      "Se la sequenza conferimento e cessione delle partecipazioni sia coerente con il regime di neutralità.",
    answerSummary:
      "Sintesi dimostrativa: la neutralità presuppone continuità dei valori fiscali e ragioni economiche effettive dell'operazione.",
    relatedTopics: ["Riorganizzazioni", "Partecipation exemption"],
  }),
  record({
    id: "int-2024-266",
    number: "266/2024",
    publicationDate: "2024-10-08",
    title: "Fusione transfrontaliera e riporto delle perdite pregresse",
    abstract:
      "Nota dimostrativa sulle condizioni di riporto delle perdite in una riorganizzazione con società estera.",
    subject: "reddito-impresa",
    subSubject: "Consolidato e trasparenza",
    tags: ["fusione", "perdite", "test di vitalità"],
    legalReferences: ["art. 172, comma 7, TUIR"],
    lastVerifiedAt: "2026-03-11",
    workflowStatus: "PUBLISHED",
    question:
      "Quali limiti si applicano al riporto delle perdite della società incorporata non residente.",
    answerSummary:
      "Sintesi dimostrativa: il riporto richiede il superamento dei parametri di vitalità economica e il rispetto del limite patrimoniale.",
    relatedTopics: ["Operazioni straordinarie", "Perdite fiscali"],
  }),
  record({
    id: "int-2024-118",
    number: "118/2024",
    publicationDate: "2024-05-21",
    title: "Credito d'imposta per ricerca svolta su commessa infragruppo",
    abstract:
      "Sintesi redazionale sui requisiti soggettivi dell'agevolazione quando l'attività è svolta per una società del gruppo.",
    subject: "agevolazioni",
    subSubject: "Ricerca e sviluppo",
    tags: ["credito d'imposta", "ricerca e sviluppo", "commessa"],
    legalReferences: ["art. 1, commi 198-206, l. 160/2019"],
    lastVerifiedAt: "2026-02-02",
    workflowStatus: "PUBLISHED",
    question:
      "Se la società che esegue attività di ricerca per conto della capogruppo possa fruire del credito d'imposta.",
    answerSummary:
      "Sintesi dimostrativa: rilevano la titolarità dei risultati e l'assunzione del rischio dell'attività di ricerca.",
    relatedTopics: ["Transfer pricing", "Patent box"],
  }),
  record({
    id: "int-2024-061",
    number: "61/2024",
    publicationDate: "2024-02-27",
    title: "Patent box e beni immateriali sviluppati con contratti di ricerca",
    abstract:
      "Sintesi sui criteri di individuazione dei beni agevolabili e sulla documentazione di supporto.",
    subject: "agevolazioni",
    subSubject: "Patent box",
    tags: ["patent box", "beni immateriali", "documentazione"],
    legalReferences: ["art. 6 d.l. 146/2021"],
    lastVerifiedAt: "2026-02-02",
    workflowStatus: "PUBLISHED",
    question:
      "Quali spese possano concorrere alla maggiorazione deducibile in presenza di attività commissionate a terzi.",
    answerSummary:
      "Sintesi dimostrativa: rilevano le spese direttamente collegate al bene agevolabile, con tracciabilità dei costi sostenuti.",
    relatedTopics: ["Ricerca e sviluppo", "Intangibili"],
  }),
  record({
    id: "int-2023-410",
    number: "410/2023",
    publicationDate: "2023-11-27",
    title: "Rateazione delle somme dovute ed effetti sui termini procedurali",
    abstract:
      "Nota sintetica sugli effetti della richiesta di rateazione sui termini e sulle misure cautelari.",
    subject: "adempimenti",
    subSubject: null,
    tags: ["rateazione", "riscossione", "adempimenti"],
    legalReferences: ["art. 19 d.P.R. 602/1973"],
    lastVerifiedAt: "2025-12-18",
    workflowStatus: "STALE",
    question:
      "Se la presentazione dell'istanza di rateazione sospenda le iniziative di recupero già avviate.",
    answerSummary:
      "Sintesi dimostrativa: gli effetti decorrono dall'accoglimento dell'istanza, salvo cause di decadenza dal beneficio.",
    relatedTopics: ["Riscossione", "Procedure"],
  }),
  record({
    id: "int-2023-355",
    number: "355/2023",
    publicationDate: "2023-09-05",
    title: "Accordi preventivi per imprese con attività internazionale: ambito di accesso",
    abstract:
      "Sintesi dei presupposti di ammissibilità dell'istanza e del rapporto con i controlli in corso.",
    subject: "internazionale-tp",
    subSubject: "Transfer pricing",
    tags: ["accordi preventivi", "APA", "ruling"],
    legalReferences: ["art. 31-ter d.P.R. 600/1973"],
    lastVerifiedAt: "2025-12-18",
    workflowStatus: "PUBLISHED",
    question:
      "Se l'istanza di accordo preventivo sia ammissibile in presenza di verifiche già avviate sugli stessi periodi.",
    answerSummary:
      "Sintesi dimostrativa: l'ammissibilità va valutata in relazione all'oggetto dell'istanza e ai periodi effettivamente coperti.",
    relatedTopics: ["MAP", "Transfer pricing", "Contenzioso"],
  }),
  record({
    id: "int-2023-201",
    number: "201/2023",
    publicationDate: "2023-06-19",
    title: "Cash pooling e remunerazione della funzione di tesoreria di gruppo",
    abstract:
      "Ricostruzione dimostrativa dei criteri di remunerazione della società che gestisce la liquidità del gruppo.",
    subject: "internazionale-tp",
    subSubject: "Transfer pricing",
    tags: ["cash pooling", "tesoreria", "servizi finanziari"],
    legalReferences: ["art. 110, comma 7, TUIR", "Linee guida OCSE, cap. X"],
    lastVerifiedAt: "2025-11-04",
    workflowStatus: "PUBLISHED",
    question:
      "Come remunerare la società che svolge funzioni di tesoreria accentrata per le consociate.",
    answerSummary:
      "Sintesi dimostrativa: la remunerazione dipende dalle funzioni svolte e dai rischi assunti, distinguendo attività di servizio e di intermediazione.",
    relatedTopics: ["Servizi infragruppo", "Transfer pricing finanziario"],
  }),
  record({
    id: "int-2023-097",
    number: "97/2023",
    publicationDate: "2023-03-22",
    title: "Dividendi da partecipazioni estere e prova del livello di tassazione",
    abstract:
      "Nota sintetica sugli elementi utili a dimostrare il carico fiscale della società partecipata non residente.",
    subject: "internazionale-tp",
    subSubject: "CFC",
    tags: ["dividendi", "CFC", "carico fiscale"],
    legalReferences: ["art. 167 TUIR", "art. 89 TUIR"],
    lastVerifiedAt: "2025-09-09",
    workflowStatus: "ARCHIVED",
    question:
      "Quali elementi documentali consentono di verificare il livello di tassazione effettiva della partecipata estera.",
    answerSummary:
      "Sintesi dimostrativa: il confronto va effettuato sui dati di bilancio rettificati secondo le regole nazionali di determinazione del reddito.",
    relatedTopics: ["CFC", "Dividendi", "Fiscalità internazionale"],
  }),
];
