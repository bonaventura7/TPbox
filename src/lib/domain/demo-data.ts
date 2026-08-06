/**
 * Dati demo per la sezione Attualità.
 * Articoli reali da fonti istituzionali — marcati isDemo: true.
 * Regola d'oro: ogni articolo riporta originalUrl (fonte) e pdfUrl (documento ufficiale) quando disponibile.
 */
import type { NewsItem } from "@/lib/domain/types";

export const DEMO_NEWS_ITEMS: NewsItem[] = [
  {
    id: "news-india-apa-2025-26",
    title: "India pubblica il Rapporto APA 2025-26: record di accordi preventivi",
    summary:
      "Il CBDT ha siglato 220 APA nell'esercizio 2025-26, il massimo storico, portando il totale cumulativo a 1.035 accordi. Record anche per le BAPA (84), con prime intese bilaterali con Francia, Indonesia, Irlanda e Svezia. Il regime safe harbor per i servizi IT è stato unificato al 15,5% con soglia di fatturato elevata a INR 20 miliardi. Il periodo mediano di risoluzione è di 36 mesi per le UAPA e 38 mesi per le BAPA.",
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
    originalUrl: "https://regfollower.com/india-publishes-25-26-apa-report-highlighting-record-agreements/",
    pdfUrl: "https://www.incometaxindia.gov.in/documents/d/guest/apa-report2025-26-2-pdf",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-ocse-mcaa-cbc-2026",
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
    originalUrl: "https://regfollower.com/oecd-updates-signatories-list-for-mcaa-cbc/",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-malaysia-tp-loans-2026",
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
    originalUrl: "https://regfollower.com/malaysia-issues-transfer-pricing-guidelines-for-intra-group-loans/",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-belgio-pillar-two-gir-2026",
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
    originalUrl: "https://regfollower.com/belgium-clarifies-extension-of-pillar-two-gir-filing-notification-deadline-for-2024-25/",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-australia-globe-2026",
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
    originalUrl: "https://regfollower.com/australia-updates-globe-minimum-tax-provisions-on-cfc-interaction-deferred-tax-assets-flow-through-entities/",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-germania-iva-ristoranti-2026",
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
    originalUrl: "https://regfollower.com/germany-approves-permanent-7-vat-for-restaurant-food/",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-cipro-iva-scadenze-2026",
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
    originalUrl: "https://regfollower.com/cyprus-extends-filing-deadlines-for-june-2026-vat-returns-july-2026-vies-statements/",
    workflowState: "PUBLISHED",
    isDemo: true,
  },
  {
    id: "news-paesi-bassi-hybrid-mismatch-2026",
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
    originalUrl: "https://regfollower.com/netherlands-updates-hybrid-mismatch-guidance-with-new-rules-on-us-tax-regimes-permanent-establishments/",
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
