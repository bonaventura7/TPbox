/**
 * Golden fixture — India, Rapporto APA 2025-26.
 *
 * I fatti sono esclusivamente quelli già presenti nel progetto (voce demo
 * `news-india-apa-2025-26`): nessun dato nuovo è stato introdotto. Il test che
 * la usa verifica struttura, densità e validator, non la verità dei dati.
 */
import type { EditorialDraft } from "@/editorial-engine";

const PRIMARY_URL = "https://www.incometaxindia.gov.in/documents/d/guest/apa-report2025-26-2-pdf";

const paragraph = (sentence: string, times: number): string =>
  Array.from({ length: times }, () => sentence).join(" ");

/**
 * Il corpo ripete enunciati già verificati per raggiungere la densità richiesta
 * dal tipo APA senza aggiungere fatti: il fixture misura il gate, non lo stile.
 */
export const INDIA_APA_DRAFT: EditorialDraft = {
  newsType: "APA",
  category: "TP",
  title: "India pubblica il Rapporto APA 2025-26: record di accordi preventivi",
  slug: "india-rapporto-apa-2025-26",
  excerpt:
    "Il CBDT ha siglato 220 APA nell'esercizio 2025-26, il massimo storico, portando il totale cumulativo a 1.035 accordi. Record anche per le BAPA (84), con prime intese bilaterali con Francia, Indonesia, Irlanda e Svezia.",
  bodyMd: [
    "## I dati del programma",
    "",
    paragraph(
      "Nell'esercizio 2025-26 il Central Board of Direct Taxes ha sottoscritto 220 accordi preventivi sui prezzi di trasferimento, portando il totale cumulativo del programma a 1.035 intese.",
      6,
    ),
    "",
    "## Componente unilaterale e bilaterale",
    "",
    paragraph(
      "Gli accordi bilaterali conclusi nell'esercizio sono 84, anch'essi un massimo storico, e comprendono le prime intese con Francia, Indonesia, Irlanda e Svezia.",
      6,
    ),
    "",
    "## Tempi di conclusione",
    "",
    paragraph(
      "Il periodo mediano di risoluzione indicato dal rapporto è di 36 mesi per gli accordi unilaterali e di 38 mesi per quelli bilaterali.",
      6,
    ),
    "",
    "## Effetti per i gruppi con presenza in India",
    "",
    paragraph(
      "L'ampliamento della rete bilaterale riduce l'area nella quale una rettifica indiana resta priva di rimedio corrispondente nell'altro Stato contraente.",
      6,
    ),
    "",
    "## Cosa resta fuori dal documento",
    "",
    paragraph(
      "Il rapporto non contiene misure di safe harbour: quelle vanno lette sul provvedimento che le dispone, non su questo documento.",
      6,
    ),
  ].join("\n"),
  sources: [
    {
      label: "Central Board of Direct Taxes (CBDT) – India, Rapporto APA 2025-26",
      url: PRIMARY_URL,
      role: "PRIMARY",
    },
  ],
  boxes: [
    {
      kind: "TECNICO",
      title: "I numeri del rapporto",
      lines: [
        "- 220 APA sottoscritti nell'esercizio 2025-26",
        "- 1.035 accordi cumulativi dall'avvio del programma",
        "- 84 accordi bilaterali, massimo storico",
      ],
    },
    {
      kind: "PRATICA",
      title: "Orizzonte temporale dell'istanza",
      lines: [
        "Periodo mediano di risoluzione: 36 mesi per le UAPA, 38 mesi per le BAPA.",
      ],
    },
  ],
  takeaways: [
    "220 accordi in un solo esercizio: il programma indiano cresce in volume, non solo in anzianità.",
    "Le prime intese bilaterali con Francia, Indonesia, Irlanda e Svezia ampliano la rete convenzionale utilizzabile.",
    "La certezza si valuta su un orizzonte pluriennale: la mediana resta sopra i tre anni.",
  ],
  normativeReferences: [],
};
