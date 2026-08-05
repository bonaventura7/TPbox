import { createFileRoute } from "@tanstack/react-router";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader, Prose } from "@/components/site/SectionPage";

const TITLE = "Giurisprudenza in materia di prezzi di trasferimento";
const DESCRIPTION =
  "Rassegna ragionata di pronunce di merito e di legittimità su metodi, comparabili, onere della prova e servizi infragruppo.";

export const Route = createFileRoute("/giurisprudenza")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: GiurisprudenzaPage,
});

const CASES = [
  {
    id: "gd-2026-018",
    heading: "Selezione dei comparabili e motivazione degli scarti",
    principle:
      "La rettifica è annullata quando l'ufficio non motiva l'esclusione delle società indicate dal contribuente nel set di comparabili.",
    forum: "Corte di giustizia tributaria di secondo grado (caso demo)",
    date: "2026-06-14",
    topic: "Metodi e comparabili",
  },
  {
    id: "gd-2026-011",
    heading: "Servizi infragruppo: beneficio e inerenza",
    principle:
      "La deducibilità dei costi per servizi resi dalla capogruppo richiede la prova dell'utilità concreta per la controllata.",
    forum: "Corte di legittimità (caso demo)",
    date: "2026-04-02",
    topic: "Servizi infragruppo",
  },
  {
    id: "gd-2026-005",
    heading: "Intangibili di marketing e remunerazione del distributore",
    principle:
      "Le spese pubblicitarie eccedenti la funzione di distribuzione possono richiedere una remunerazione aggiuntiva.",
    forum: "Corte di giustizia tributaria di primo grado (caso demo)",
    date: "2026-02-19",
    topic: "Intangibili",
  },
  {
    id: "gd-2025-047",
    heading: "Finanziamenti infragruppo e rating implicito",
    principle:
      "La determinazione del tasso deve considerare il merito di credito autonomo della società finanziata.",
    forum: "Corte di legittimità (caso demo)",
    date: "2025-11-27",
    topic: "Metodi e comparabili",
  },
];

function GiurisprudenzaPage() {
  return (
    <>
      <PageHeader eyebrow="Giurisprudenza" title={TITLE} intro={DESCRIPTION} />
      <Prose>
        <div className="mb-6 flex items-center gap-3">
          <DemoBadge />
          <p className="text-sm text-muted-foreground">
            Massime dimostrative: i riferimenti non corrispondono a decisioni reali.
          </p>
        </div>
        <ul className="space-y-4">
          {CASES.map((item) => (
            <li key={item.id} className="border border-border bg-card p-5 sm:p-6">
              <p className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                {item.topic} · {new Date(item.date).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
              <h2 className="mt-2 font-serif text-xl leading-snug">{item.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.principle}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">{item.forum}</p>
            </li>
          ))}
        </ul>
      </Prose>
    </>
  );
}