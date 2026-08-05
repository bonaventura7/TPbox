import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/site/SectionPage";

const TITLE = "Strumenti di analisi";
const DESCRIPTION =
  "Due strumenti operativi: Company Finder per identificare in modo univoco una società e Bilancio Finder per consultarne i dati economico-finanziari.";

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
              Ricerca per ragione sociale o numero di partita IVA, con selezione esplicita
              della società e assegnazione di un identificativo interno.
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
            <h2 className="font-serif text-2xl">Bilancio Finder</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Consultazione dei dati economico-finanziari a partire da una società già
              risolta tramite Company Finder.
            </p>
            <Link
              to="/tool/bilancio-finder"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
            >
              Apri Bilancio Finder
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}