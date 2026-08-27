/**
 * Struttura adattiva per tipo di notizia.
 *
 * Non è un vincolo estetico: è il contratto che il validator misura. Ogni tipo
 * dichiara le sezioni attese, i box utili e la densità minima, perché un caso
 * giurisprudenziale e un aggiornamento OCSE non hanno lo stesso peso
 * informativo né la stessa lunghezza ragionevole.
 */
import type { DraftBoxKind, NewsType } from "./types";

export interface TypeStructure {
  /** Sezioni H2 attese, nell'ordine suggerito. */
  sections: string[];
  /** Box previsti per questo tipo. */
  boxes: DraftBoxKind[];
  /** Parole minime accettate dal validator. */
  minWords: number;
  /** Intervallo indicativo comunicato al generatore. */
  targetWords: [number, number];
  /** Numero minimo di takeaway. */
  minTakeaways: number;
}

const BASE_TARGET: [number, number] = [1200, 1800];

export const TYPE_STRUCTURES: Record<NewsType, TypeStructure> = {
  REGULATORY_UPDATE: {
    sections: [
      "Che cosa cambia",
      "Ambito di applicazione",
      "Decorrenza e adempimenti",
      "Effetti per i gruppi",
      "Cosa resta aperto",
    ],
    boxes: ["NORMATIVA", "PRATICA"],
    minWords: 900,
    targetWords: BASE_TARGET,
    minTakeaways: 3,
  },
  APA: {
    sections: [
      "I dati del programma",
      "Componente unilaterale e bilaterale",
      "Tempi di conclusione",
      "Effetti per i gruppi con presenza nella giurisdizione",
      "Cosa resta fuori dal documento",
    ],
    boxes: ["TECNICO", "PRATICA"],
    minWords: 900,
    targetWords: BASE_TARGET,
    minTakeaways: 3,
  },
  COURT_CASE: {
    sections: [
      "I fatti",
      "La questione giuridica",
      "La decisione",
      "Le motivazioni",
      "Rilevanza per casi analoghi",
    ],
    boxes: ["NORMATIVA", "ATTENZIONE"],
    minWords: 1000,
    targetWords: BASE_TARGET,
    minTakeaways: 3,
  },
  OECD: {
    sections: [
      "Il documento",
      "Contenuto tecnico",
      "Rapporto con le Linee Guida",
      "Effetti attesi sulle prassi nazionali",
      "Cosa resta aperto",
    ],
    boxes: ["TECNICO"],
    minWords: 900,
    targetWords: BASE_TARGET,
    minTakeaways: 3,
  },
  EU: {
    sections: [
      "L'atto",
      "Contenuto e base giuridica",
      "Iter e tempistiche",
      "Effetti per gli Stati membri",
      "Cosa resta aperto",
    ],
    boxes: ["NORMATIVA"],
    minWords: 900,
    targetWords: BASE_TARGET,
    minTakeaways: 3,
  },
  TAX_AUTHORITY: {
    sections: [
      "Il provvedimento",
      "Interpretazione dell'amministrazione",
      "Adempimenti operativi",
      "Effetti sui controlli",
      "Cosa resta aperto",
    ],
    boxes: ["PRATICA", "ATTENZIONE"],
    minWords: 850,
    targetWords: [1000, 1600],
    minTakeaways: 3,
  },
  PILLAR_TWO: {
    sections: [
      "La misura",
      "Meccanismo di calcolo",
      "Interazione con le regole GloBE",
      "Adempimenti e scadenze",
      "Cosa resta aperto",
    ],
    boxes: ["TECNICO", "NORMATIVA"],
    minWords: 1000,
    targetWords: BASE_TARGET,
    minTakeaways: 3,
  },
};

export function structureFor(newsType: NewsType): TypeStructure {
  return TYPE_STRUCTURES[newsType];
}
