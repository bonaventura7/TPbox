import {
  INTERPELLI_SOURCE_URL,
  type InterpelloRecord,
} from "./interpelli";

/**
 * Archivio dimostrativo: numeri, titoli e abstract sono redazionali e sintetici,
 * non riproducono documenti reali. I collegamenti puntano alla pagina ufficiale.
 */
function record(
  input: Omit<
    InterpelloRecord,
    "sourceName" | "sourceType" | "isDemo" | "officialUrl" | "year"
  > & { officialUrl?: string },
): InterpelloRecord {
  return {
    ...input,
    year: Number(input.publishedAt.slice(0, 4)),
    officialUrl: input.officialUrl ?? INTERPELLI_SOURCE_URL,
    sourceName: "Agenzia delle Entrate",
    sourceType: "ISTITUZIONALE",
    isDemo: true,
  };
}

export const DEMO_INTERPELLI: InterpelloRecord[] = [
  record({
    id: "int-2026-014",
    responseNumber: "14/2026",
    title: "Metodo di determinazione dei prezzi nelle cessioni infragruppo di semilavorati",
    publishedAt: "2026-06-18",
    materia: "Transfer pricing",
    keywords: ["metodi", "comparabili", "cessioni infragruppo"],
    abstract:
      "Chiarimento dimostrativo sulla scelta del metodo più appropriato quando la società italiana svolge funzioni produttive a rischio limitato.",
    lastVerifiedAt: "2026-07-30",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2026-009",
    responseNumber: "9/2026",
    title: "Documentazione idonea e penalty protection per operazioni con parti correlate",
    publishedAt: "2026-04-02",
    materia: "Transfer pricing",
    keywords: ["documentazione", "penalty protection", "masterfile"],
    abstract:
      "Sintesi redazionale sui requisiti formali della documentazione e sugli effetti sulle sanzioni amministrative.",
    lastVerifiedAt: "2026-07-30",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2025-221",
    responseNumber: "221/2025",
    title: "Stabile organizzazione occulta e attribuzione del reddito d'impresa",
    publishedAt: "2025-11-12",
    materia: "Fiscalità internazionale",
    keywords: ["stabile organizzazione", "attribuzione del reddito"],
    abstract:
      "Ricostruzione sintetica dei criteri di attribuzione del reddito a una presenza economica stabile nel territorio dello Stato.",
    lastVerifiedAt: "2026-07-30",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2025-198",
    responseNumber: "198/2025",
    title: "Ritenute su royalties corrisposte a società residente in Stato convenzionato",
    publishedAt: "2025-09-24",
    materia: "Fiscalità internazionale",
    keywords: ["royalties", "convenzioni", "ritenute"],
    abstract:
      "Nota dimostrativa sull'applicazione dell'aliquota convenzionale e sulla prova della residenza del beneficiario.",
    lastVerifiedAt: "2026-06-15",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2025-176",
    responseNumber: "176/2025",
    title: "Deducibilità degli interessi passivi in presenza di finanziamenti infragruppo",
    publishedAt: "2025-08-06",
    materia: "Reddito d'impresa e IRES",
    keywords: ["interessi passivi", "ROL", "finanziamenti"],
    abstract:
      "Esemplificazione redazionale del calcolo del limite di deducibilità e del riporto delle eccedenze.",
    lastVerifiedAt: "2026-05-20",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2025-140",
    responseNumber: "140/2025",
    title: "Trattamento IVA delle prestazioni di servizi rese a committente estero",
    publishedAt: "2025-06-11",
    materia: "IVA e operazioni con l'estero",
    keywords: ["territorialità", "servizi", "reverse charge"],
    abstract:
      "Sintesi sui criteri di territorialità e sugli adempimenti documentali nelle prestazioni verso soggetti non residenti.",
    lastVerifiedAt: "2026-05-20",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2024-302",
    responseNumber: "302/2024",
    title: "Conferimento di ramo d'azienda e continuità dei valori fiscali",
    publishedAt: "2024-12-03",
    materia: "Operazioni straordinarie",
    keywords: ["conferimento", "ramo d'azienda", "neutralità"],
    abstract:
      "Ricostruzione sintetica degli effetti fiscali del conferimento e della successiva cessione delle partecipazioni.",
    lastVerifiedAt: "2026-03-11",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2024-266",
    responseNumber: "266/2024",
    title: "Fusione transfrontaliera e riporto delle perdite pregresse",
    publishedAt: "2024-10-08",
    materia: "Operazioni straordinarie",
    keywords: ["fusione", "perdite", "test di vitalità"],
    abstract:
      "Nota dimostrativa sulle condizioni di riporto delle perdite in caso di riorganizzazione con società estera.",
    lastVerifiedAt: "2026-03-11",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2024-118",
    responseNumber: "118/2024",
    title: "Credito d'imposta per attività di ricerca svolte su commessa infragruppo",
    publishedAt: "2024-05-21",
    materia: "Agevolazioni fiscali",
    keywords: ["credito d'imposta", "ricerca e sviluppo", "commessa"],
    abstract:
      "Sintesi redazionale sui requisiti soggettivi dell'agevolazione quando l'attività è svolta per una società del gruppo.",
    lastVerifiedAt: "2026-02-02",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2024-077",
    responseNumber: "77/2024",
    title: "Regime dei lavoratori impatriati e distacco presso società del gruppo",
    publishedAt: "2024-03-14",
    materia: "Lavoro dipendente e mobilità internazionale",
    keywords: ["impatriati", "distacco", "residenza fiscale"],
    abstract:
      "Esemplificazione dei presupposti dell'agevolazione in caso di rientro a seguito di distacco internazionale.",
    lastVerifiedAt: "2026-02-02",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2023-410",
    responseNumber: "410/2023",
    title: "Rateazione delle somme dovute e effetti sulla riscossione",
    publishedAt: "2023-11-27",
    materia: "Riscossione, accertamento e sanzioni",
    keywords: ["rateazione", "riscossione", "adempimento"],
    abstract:
      "Nota sintetica sugli effetti della richiesta di rateazione sui termini e sulle misure cautelari.",
    lastVerifiedAt: "2025-12-18",
    status: "STALE",
  }),
  record({
    id: "int-2023-355",
    responseNumber: "355/2023",
    title: "Accordi preventivi per imprese con attività internazionale: ambito di accesso",
    publishedAt: "2023-09-05",
    materia: "Transfer pricing",
    keywords: ["accordi preventivi", "APA", "ruling"],
    abstract:
      "Sintesi dei presupposti di ammissibilità dell'istanza e del rapporto con i controlli in corso.",
    lastVerifiedAt: "2025-12-18",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2023-201",
    responseNumber: "201/2023",
    title: "Operazioni di cash pooling e remunerazione della funzione di tesoreria",
    publishedAt: "2023-06-19",
    materia: "Transfer pricing",
    keywords: ["cash pooling", "tesoreria", "servizi finanziari"],
    abstract:
      "Ricostruzione dimostrativa dei criteri di remunerazione della società che gestisce la liquidità di gruppo.",
    lastVerifiedAt: "2025-11-04",
    status: "PUBLISHED",
  }),
  record({
    id: "int-2022-489",
    responseNumber: "489/2022",
    title: "Dividendi da partecipazioni estere e prova del carico fiscale estero",
    publishedAt: "2022-12-15",
    materia: "Fiscalità internazionale",
    keywords: ["dividendi", "CFC", "carico fiscale"],
    abstract:
      "Nota sintetica sugli elementi utili a dimostrare il livello di tassazione della società partecipata.",
    lastVerifiedAt: "2025-09-09",
    status: "ARCHIVED",
  }),
  record({
    id: "int-2022-333",
    responseNumber: "333/2022",
    title: "Note di variazione IVA per operazioni con controparti non residenti",
    publishedAt: "2022-08-01",
    materia: "IVA e operazioni con l'estero",
    keywords: ["note di variazione", "rettifica", "estero"],
    abstract:
      "Sintesi dei termini di emissione e degli obblighi documentali nella rettifica di operazioni transfrontaliere.",
    lastVerifiedAt: "2025-09-09",
    status: "ARCHIVED",
  }),
  record({
    id: "int-2022-150",
    responseNumber: "150/2022",
    title: "Trattamento dei costi di servizi a basso valore aggiunto resi dalla capogruppo",
    publishedAt: "2022-04-27",
    materia: "Altre materie",
    keywords: ["servizi infragruppo", "basso valore aggiunto", "inerenza"],
    abstract:
      "Esemplificazione redazionale dei criteri di ripartizione dei costi e della documentazione di supporto.",
    lastVerifiedAt: "2025-06-30",
    status: "PUBLISHED",
  }),
];
