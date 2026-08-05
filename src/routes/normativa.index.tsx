import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/site/SectionPage";

const TITLE = "Normativa e prassi";
const DESCRIPTION =
  "Le fonti di riferimento sui prezzi di trasferimento: Country Profiles nazionali e ricerca delle risposte agli interpelli dell'Agenzia delle Entrate.";

export const Route = createFileRoute("/normativa/")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: NormativaIndex,
});

const AREAS = [
  {
    to: "/normativa/country-profiles",
    label: "Country Profiles",
    text: "Schede nazionali su metodi ammessi, obblighi documentali e riferimenti interni.",
  },
  {
    to: "/normativa/portale-interpelli",
    label: "Portale interpelli",
    text: "Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate, con filtri per materia, anno e numero.",
  },
] as const;

function NormativaIndex() {
  return (
    <>
      <PageHeader eyebrow="Fonti" title={TITLE} intro={DESCRIPTION} />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <ul className="grid gap-4 md:grid-cols-2">
          {AREAS.map((area) => (
            <li key={area.to} className="border border-border bg-card p-6">
              <h2 className="font-serif text-2xl">{area.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {area.text}
              </p>
              <Link
                to={area.to}
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
              >
                Consulta la sezione
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}