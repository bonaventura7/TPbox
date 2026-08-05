import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/site/SectionPage";

const TITLE = "Normativa e prassi";
const DESCRIPTION =
  "Le fonti di riferimento sui prezzi di trasferimento organizzate per ambito: OCSE, Country Profiles, Unione europea, Italia e Pillar Two.";

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
    to: "/normativa/ocse",
    label: "OCSE",
    text: "Linee guida sui prezzi di trasferimento, rapporti tematici e documenti di indirizzo.",
  },
  {
    to: "/normativa/country-profiles",
    label: "Country Profiles",
    text: "Schede nazionali su metodi ammessi, obblighi documentali e riferimenti interni.",
  },
  {
    to: "/normativa/unione-europea",
    label: "Unione europea",
    text: "Atti, orientamenti e lavori tecnici rilevanti per il mercato interno.",
  },
  {
    to: "/normativa/italia",
    label: "Italia",
    text: "Disciplina interna, prassi amministrativa e adempimenti documentali.",
  },
  {
    to: "/normativa/pillar-two",
    label: "Pillar Two",
    text: "Imposizione minima globale e interazione con le rettifiche di transfer pricing.",
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