import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/site/SectionPage";

const TITLE = "Strumenti di analisi";
const DESCRIPTION =
  "Company Finder identifica in modo univoco una società e consente di scaricarne il bilancio in forma dimostrativa, direttamente dalla scheda della società selezionata.";

export const Route = createFileRoute("/tool/")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ToolIndex,
});

function ToolIndex() {
  return (
    <>
      <PageHeader eyebrow="Tool" title={TITLE} intro={DESCRIPTION} />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <ul className="grid gap-4 md:grid-cols-2">
          <li className="border border-border bg-card p-6">
            <h2 className="font-serif text-2xl">Company Finder</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ricerca per ragione sociale o numero di partita IVA, selezione esplicita
              della società e download del bilancio dalla stessa scheda.
            </p>
            <Link
              to="/tool/company-finder"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
            >
              Apri Company Finder
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
          <li className="border border-border bg-card p-6">
            <h2 className="font-serif text-2xl">Portale interpelli</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate, ora
              nella sezione Normativa e prassi.
            </p>
            <Link
              to="/normativa/portale-interpelli"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
            >
              Vai al Portale interpelli
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}
