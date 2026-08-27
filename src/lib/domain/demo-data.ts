/**
 * Dati demo per la sezione Attualità.
 * Articoli reali da fonti istituzionali — marcati isDemo: true.
 * Regola d'oro: ogni articolo riporta originalUrl (fonte) e pdfUrl (documento ufficiale) quando disponibile.
 */
import type {
  CompanyCandidate,
  FinancialYear,
  NewsItem,
  NewsSource,
} from "@/lib/domain/types";

export const DEMO_NEWS_ITEMS: NewsItem[] = [
  {
    id: "news-india-apa-2025-26",
    slug: "india-rapporto-apa-2025-26",
    title: "India pubblica il Rapporto APA 2025-26: record di accordi preventivi",
    summary:
      "Il CBDT ha siglato 220 APA nell'esercizio 2025-26, il massimo storico, portando il totale cumulativo a 1.035 accordi. Record anche per le BAPA (84), con prime intese bilaterali con Francia, Indonesia, Irlanda e Svezia. Il periodo mediano di risoluzione è di 36 mesi per le UAPA e 38 mesi per le BAPA.",
    sourceId: "src-cbdt-india",
    sourceName: "Central Board of Direct Taxes (CBDT) – India",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-04",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "GLOBALE",
    country: "India",
    topic: "APA e MAP",
    category: "Transfer Pricing",
    body: [
      "## Che cosa dice il rapporto",
      "",
      "Il Central Board of Direct Taxes ha pubblicato l'ottavo rapporto annuale sul programma degli accordi preventivi sui prezzi di trasferimento. Nell'esercizio 2025-26 sono stati sottoscritti 220 accordi, il numero più alto dall'avvio del programma, che portano il totale cumulativo a 1.035 intese.",
      "",
      "Il dato che più incide sulla pianificazione di gruppo riguarda la componente bilaterale: 84 accordi bilaterali in un solo esercizio, anch'essi un massimo storico. Tra questi figurano le prime intese concluse con Francia, Indonesia, Irlanda e Svezia, giurisdizioni fino a oggi assenti dal quadro bilaterale indiano.",
      "",
      "## I tempi di conclusione",
      "",
      "Il rapporto indica un periodo mediano di risoluzione di 36 mesi per gli accordi unilaterali e di 38 mesi per quelli bilaterali. È l'elemento da tenere presente quando si valuta se aprire un'istanza: il vantaggio della certezza si misura su un orizzonte pluriennale, e l'esercizio coperto dal rollback va considerato in sede di stima.",
      "",
      "## Perché interessa un gruppo con presenza in India",
      "",
      "L'ampliamento della rete bilaterale riduce l'area nella quale una rettifica indiana resta priva di rimedio corrispondente nell'altro Stato. Per i gruppi italiani con società indiane l'apertura verso nuovi partner convenzionali sposta il confronto dal contenzioso interno alla sede bilaterale, dove la doppia imposizione si risolve tra amministrazioni.",
      "",
      "Restano fuori da questa nota le misure di safe harbour: non sono contenute nel rapporto APA e vanno lette sul provvedimento che le dispone. Una voce, una fonte.",
    ].join("\n"),
    originalUrl: "https://www.incometaxindia.gov.in/documents/d/guest/apa-report2025-26-2-pdf",
    pdfUrl: "https://www.incometaxindia.gov.in/documents/d/guest/apa-report2025-26-2-pdf",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-ocse-mcaa-cbc-2026",
    slug: "ocse-firmatari-mcaa-cbc-2026",
    title: "OCSE aggiorna la lista dei firmatari del MCAA-CbC",
    summary:
      "L'OCSE ha pubblicato l'elenco aggiornato dei firmatari del Multilateral Competent Authority Agreement on Country-by-Country Reporting (MCAA-CbC). L'aggiornamento riflette le nuove adesioni e modifica le condizioni di scambio automatico dei dati CbCR tra giurisdizioni partecipanti, in attuazione dell'Azione 13 BEPS.",
    sourceId: "src-ocse",
    sourceName: "OCSE – Centro per la Politica Fiscale e l'Amministrazione",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-03",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "OCSE",
    country: "OCSE",
    topic: "Documentazione",
    category: "Transfer Pricing",
    originalUrl: "https://www.oecd.org",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-malaysia-tp-loans-2026",
    slug: "malaysia-linee-guida-tp-finanziamenti-infragruppo",
    title: "Malaysia emana le linee guida TP per i finanziamenti infragruppo",
    summary:
      "L'Inland Revenue Board of Malaysia (IRBM) ha pubblicato le Malaysia Transfer Pricing Guidelines per i prestiti infragruppo, allineate alle Linee Guida OCSE 2022 (capitolo X). Le linee guida disciplinano la determinazione del tasso arm's length con riferimento al merito creditizio, ai comparabili di mercato e alla funzione di garanzia implicita del gruppo.",
    sourceId: "src-irbm-malaysia",
    sourceName: "Inland Revenue Board of Malaysia (IRBM)",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-03",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "GLOBALE",
    country: "Malaysia",
    topic: "Metodi e comparabili",
    category: "Transfer Pricing",
    originalUrl: "https://www.hasil.gov.my",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-belgio-pillar-two-gir-2026",
    slug: "belgio-proroga-notifica-gir-pillar-two",
    title: "Belgio proroga il termine per la notifica del mandatario GIR Pillar Two 2024-25",
    summary:
      "Il Servizio Pubblico Federale delle Finanze del Belgio ha chiarito la proroga del termine per la designazione dell'entità responsabile della presentazione del Global Information Return (GIR) ai sensi della Direttiva 2022/2523/UE (Pillar Two). La proroga riguarda i periodi d'imposta 2024 e 2025.",
    sourceId: "src-fps-belgio",
    sourceName: "Federal Public Service Finance – Belgio",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-04",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "UE",
    country: "Belgio",
    topic: "Pillar Two",
    category: "Pillar Two",
    originalUrl: "https://finance.belgium.be",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-australia-globe-2026",
    slug: "australia-regole-globe-2026",
    title: "Australia aggiorna le disposizioni GloBE: interazione CFC, DTA e entità trasparenti",
    summary:
      "L'ATO ha emanato le Amending Rules 2026 (Misure n. 2) che modificano la Taxation (Multinational—Global and Domestic Minimum Tax) Act in materia di interazione con le CFC rules, deferred tax assets e flow-through entities. Le modifiche recepiscono le linee guida amministrative OCSE GloBE del 2025.",
    sourceId: "src-ato-australia",
    sourceName: "Australian Taxation Office (ATO)",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-04",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "GLOBALE",
    country: "Australia",
    topic: "Pillar Two",
    category: "Pillar Two",
    originalUrl: "https://www.ato.gov.au",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-germania-iva-ristoranti-2026",
    slug: "germania-iva-ristorazione-aliquota-7",
    title: "Germania: IVA al 7% permanente sugli alimenti nei ristoranti dal 2026",
    summary:
      "Il Tax Amendment Act 2025 tedesco rende permanente l'aliquota IVA ridotta al 7% sugli alimenti somministrati in ristoranti e servizi di catering a partire dal 1° gennaio 2026, mentre le bevande restano soggette all'aliquota ordinaria del 19%. La misura era precedentemente temporanea.",
    sourceId: "src-bmf-germania",
    sourceName: "Bundesministerium der Finanzen (BMF) – Germania",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-04",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "UE",
    country: "Germania",
    topic: "Servizi infragruppo",
    category: "VAT",
    originalUrl: "https://www.bundesfinanzministerium.de",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-cipro-iva-scadenze-2026",
    slug: "cipro-scadenze-iva-e-vies",
    title: "Cipro proroga le scadenze per le dichiarazioni IVA di giugno 2026 e VIES di luglio 2026",
    summary:
      "Il Tax Department di Cipro ha concesso una proroga per la presentazione delle dichiarazioni IVA relative al periodo chiuso il 30 giugno 2026 e per i Modelli Riepilogativi (VIES) del luglio 2026, in considerazione del periodo estivo. I contribuenti interessati beneficiano di giorni aggiuntivi per il versamento dell'IVA dovuta.",
    sourceId: "src-tax-dept-cipro",
    sourceName: "Tax Department – Repubblica di Cipro",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-04",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "UE",
    country: "Cipro",
    topic: "Documentazione",
    category: "VAT",
    originalUrl: "https://www.mof.gov.cy",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-paesi-bassi-hybrid-mismatch-2026",
    slug: "paesi-bassi-disallineamenti-da-ibridi",
    title: "Paesi Bassi: nuove regole sui disallineamenti ibridi per regimi fiscali USA e stabili organizzazioni",
    summary:
      "Il Decreto sulla Politica dei Disallineamenti Ibridi 2026 (Decreto n. 2026-12123) recepisce le modifiche introdotte dal Segretario di Stato alle Finanze olandese in materia di ATAD 2. Il provvedimento aggiorna le istruzioni applicative per i regimi fiscali statunitensi (check-the-box, S-corporations) e le stabili organizzazioni, chiarendo i casi di doppia non-imposizione rilevanti.",
    sourceId: "src-mof-nl",
    sourceName: "Ministerie van Financiën – Paesi Bassi",
    sourceKind: "ISTITUZIONALE",
    sourceTier: "PRIMARY",
    originalDate: "2026-08-03",
    lastVerifiedAt: "2026-08-06T09:00:00Z",
    language: "en",
    geo: "UE",
    country: "Paesi Bassi",
    topic: "Contenzioso",
    category: "Anti-Avoidance",
    originalUrl: "https://www.rijksoverheid.nl",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
];

/**
 * Estrae i paesi distinti dalla lista articoli (per il filtro dinamico).
 */
export function getAvailableCountries(items: NewsItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.country) set.add(item.country);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

/** Alias stabile usato dai repository server-side. */
export const DEMO_NEWS: NewsItem[] = DEMO_NEWS_ITEMS;

/** Bozze in attesa di revisione redazionale (nessuna pubblicazione automatica). */
export const DEMO_DRAFTS_PENDING = 4;

/** Configurazione fonti demo: nessun feed RSS non verificato. */
export const DEMO_SOURCES: NewsSource[] = [
  {
    id: "src-oecd-tp",
    name: "OECD Transfer Pricing",
    acquisitionMode: "HTML_WATCH",
    tier: "PRIMARY",
    kind: "ISTITUZIONALE",
    feedUrl: null,
    siteUrl: "https://www.oecd.org/tax/transfer-pricing/",
    geo: "OCSE",
    note: "Nessun feed verificato disponibile: monitoraggio pagina lato server.",
  },
  {
    id: "src-ec-taxud",
    name: "European Commission — Taxation and Customs News",
    acquisitionMode: "HTML_WATCH",
    tier: "PRIMARY",
    kind: "ISTITUZIONALE",
    feedUrl: null,
    siteUrl: "https://taxation-customs.ec.europa.eu/news_en",
    geo: "UE",
    note: "Monitoraggio pagina lato server; ingresso obbligatorio come bozza.",
  },
  {
    id: "src-mnetax",
    name: "MNE Tax — Transfer Pricing",
    acquisitionMode: "HTML_WATCH",
    tier: "SECONDARY",
    kind: "PROFESSIONALE",
    feedUrl: null,
    siteUrl: "https://mnetax.com/category/transfer-pricing",
    geo: "GLOBALE",
    note: "Fonte secondaria: utilizzata solo a supporto di fonti primarie.",
  },
  {
    id: "src-kluwer",
    name: "Kluwer International Tax Blog",
    acquisitionMode: "HTML_WATCH",
    tier: "SECONDARY",
    kind: "PROFESSIONALE",
    feedUrl: null,
    siteUrl: "https://kluwertaxblog.com/",
    geo: "GLOBALE",
    note: "Fonte secondaria: contributi dottrinali, sempre in revisione.",
  },
  {
    id: "src-wu-learn",
    name: "WU LEARN — general news",
    acquisitionMode: "DISABLED",
    tier: "SECONDARY",
    kind: "ACCADEMICA",
    feedUrl: null,
    siteUrl: "https://www.wu.ac.at/en/taxlaw",
    geo: "GLOBALE",
    note: "Fonte disattivata: si utilizzano soltanto metadati sintetici.",
  },
];

/** Società dimostrative risolte da Company Finder. */
export const DEMO_COMPANIES: CompanyCandidate[] = [
  {
    companyId: "cmp-001",
    legalName: "Alpina Components S.p.A.",
    country: "IT",
    city: "Milano",
    legalForm: "Società per azioni",
    activity: "Componentistica industriale",
    lastFilingYear: 2024,
    isDemo: true,
  },
  {
    companyId: "cmp-002",
    legalName: "Alpina Services S.r.l.",
    country: "IT",
    city: "Torino",
    legalForm: "Società a responsabilità limitata",
    activity: "Servizi infragruppo",
    lastFilingYear: 2024,
    isDemo: true,
  },
  {
    companyId: "cmp-003",
    legalName: "Meridiana Distribution GmbH",
    country: "DE",
    city: "Monaco di Baviera",
    legalForm: "GmbH",
    activity: "Distribuzione all'ingrosso",
    lastFilingYear: 2023,
    isDemo: true,
  },
];

/** Serie economico-finanziarie dimostrative per companyId. */
export const DEMO_FINANCIALS: Record<string, FinancialYear[]> = {
  "cmp-001": [
    { year: 2024, revenue: 184_500_000, ebit: 12_900_000, netResult: 8_400_000, totalAssets: 142_000_000, equity: 61_000_000, employees: 612 },
    { year: 2023, revenue: 171_200_000, ebit: 10_400_000, netResult: 6_900_000, totalAssets: 136_500_000, equity: 55_300_000, employees: 589 },
    { year: 2022, revenue: 158_900_000, ebit: 9_100_000, netResult: 5_600_000, totalAssets: 129_800_000, equity: 50_100_000, employees: 564 },
  ],
  "cmp-002": [
    { year: 2024, revenue: 42_300_000, ebit: 2_100_000, netResult: 1_350_000, totalAssets: 28_400_000, equity: 11_800_000, employees: 148 },
    { year: 2023, revenue: 39_800_000, ebit: 1_780_000, netResult: 1_020_000, totalAssets: 26_900_000, equity: 10_600_000, employees: 141 },
  ],
  "cmp-003": [
    { year: 2023, revenue: 96_700_000, ebit: 4_800_000, netResult: 3_050_000, totalAssets: 71_200_000, equity: 24_900_000, employees: 233 },
    { year: 2022, revenue: 91_100_000, ebit: 4_150_000, netResult: 2_480_000, totalAssets: 68_400_000, equity: 22_600_000, employees: 226 },
  ],
};

/** Serie di riserva usata quando il provider non copre la società richiesta. */
export const DEMO_FINANCIALS_FALLBACK: FinancialYear[] = [
  { year: 2024, revenue: 25_000_000, ebit: 1_250_000, netResult: 780_000, totalAssets: 18_500_000, equity: 7_400_000, employees: 96 },
];
