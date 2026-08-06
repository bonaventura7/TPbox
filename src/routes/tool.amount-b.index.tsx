/**
 * Amount B – Scheda dello strumento.
 *
 * Pagina di ingresso: che cosa fa lo strumento, che cosa non fa, e avvio del
 * calcolo guidato.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

import {
  WORKBOOK_VERSION,
  DATASET_LABELS,
  DEFAULT_DATASET_VERSION,
  getJurisdictions,
} from "../lib/amount-b/datasets/registry";

const TITLE = "Amount B (Pillar One): calcolo guidato — Osservatorio Transfer Pricing";
const DESCRIPTION =
  "Calcolo dell'Approccio Semplificato e Razionalizzato del Pillar One OCSE: criterio quantitativo di scoping, matrice di pricing, cross-check sui costi operativi e data availability mechanism.";
const CANONICAL = "https://transfer-guide-italia.lovable.app/tool/amount-b";

export const Route = createFileRoute("/tool/amount-b/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: AmountBIndex,
});

const PHASES = [
  {
    title: "Scoping",
    body: "Verifica del criterio quantitativo del paragrafo 13.b: i costi operativi medi del triennio devono stare tra il 3% e il limite superiore fissato dalla giurisdizione.",
  },
  {
    title: "Matrice di pricing",
    body: "Classificazione di factor intensity dalle attività operative nette e dai costi operativi, poi lettura della cella della matrice per industry grouping.",
  },
  {
    title: "Rettifiche",
    body: "Cross-check sui costi operativi con cap e collar, e rettifica di rischio sovrano per le giurisdizioni ammesse al data availability mechanism.",
  },
] as const;

function AmountBIndex() {
  const jurisdictionCount = getJurisdictions(DEFAULT_DATASET_VERSION).length;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Tool · Pillar One
      </p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Amount B</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Determinazione del return on sales per le attività di distribuzione di routine secondo
        l&apos;Approccio Semplificato e Razionalizzato, riprodotto dal workbook OCSE.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 font-medium">
          Workbook OCSE {WORKBOOK_VERSION}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          {DATASET_LABELS[DEFAULT_DATASET_VERSION]}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          {jurisdictionCount} giurisdizioni
        </span>
      </div>

      <div className="mt-8">
        <Link
          to="/tool/amount-b/nuovo"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Avvia il calcolo guidato
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="mt-2 text-sm text-muted-foreground">
          I campi partono precompilati con il campione del workbook OCSE: si può premere avanti e
          vedere subito un risultato completo.
        </p>
      </div>

      {/* Come funziona */}
      <section aria-labelledby="fasi" className="mt-14">
        <h2 id="fasi" className="font-serif text-2xl">
          Che cosa calcola
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {PHASES.map((phase, i) => (
            <li key={phase.title} className="border-t-2 border-petrol/30 pt-4">
              <span className="text-xs tabular-nums text-petrol">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 font-serif text-lg">{phase.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{phase.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Limiti */}
      <section
        aria-labelledby="limiti"
        className="mt-14 rounded-lg border border-rule bg-surface p-6"
      >
        <h2 id="limiti" className="font-serif text-2xl">
          Che cosa non calcola
        </h2>
        <p className="mt-3 max-w-3xl text-sm">
          Gli elementi qualitativi dello scoping, ai paragrafi 13.a e 14 della guidance, non sono
          automatizzabili e restano una valutazione professionale. Lo strumento riporta l&apos;esito
          del solo criterio quantitativo e non conclude sull&apos;applicabilità dell&apos;approccio.
        </p>
        <p className="mt-3 max-w-3xl text-sm">
          La presenza di una giurisdizione nella tabella OCSE non significa che essa abbia adottato
          o adotterà l&apos;approccio semplificato. I risultati vanno approvati da un professionista
          prima di essere usati su posizioni reali.
        </p>
      </section>

      {/* Fonti */}
      <section aria-labelledby="fonti" className="mt-14">
        <h2 id="fonti" className="font-serif text-2xl">
          Fonti
        </h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>
            <a
              href="https://www.oecd.org/en/topics/sub-issues/transfer-pricing/pillar-one-amount-b.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-petrol hover:underline"
            >
              OCSE, Pillar One Amount B e Pricing Automation Tool
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <p className="text-muted-foreground">
              Matrice di pricing, fasce cap e collar, scala rating-NRA e tabelle delle giurisdizioni
              provengono dalla versione February 2026 del workbook.
            </p>
          </li>
          <li>
            <a
              href="https://github.com/bonaventura7/transfer-guide-italia/blob/main/docs/amount-b-calculation-manifest.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-petrol hover:underline"
            >
              Manifest delle regole di calcolo
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <p className="text-muted-foreground">
              Corrispondenza tra le formule del workbook e le funzioni dell&apos;implementazione.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}
