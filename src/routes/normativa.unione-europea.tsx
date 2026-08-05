import { createFileRoute } from "@tanstack/react-router";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader, Prose, ReferenceList } from "@/components/site/SectionPage";

const TITLE = "Fonti dell'Unione europea";
const DESCRIPTION =
  "Atti, orientamenti e lavori tecnici europei rilevanti per la determinazione dei prezzi di trasferimento nel mercato interno.";

export const Route = createFileRoute("/normativa/unione-europea")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: UePage,
});

const ITEMS = [
  {
    title: "Documentazione infragruppo nel mercato interno",
    description:
      "Sintesi demo sui profili di armonizzazione degli obblighi documentali e sulla riduzione degli oneri per i gruppi transfrontalieri.",
    meta: "Scheda demo · fonte istituzionale primaria",
  },
  {
    title: "Risoluzione delle controversie fiscali",
    description:
      "Sintesi demo su procedure amichevoli, arbitrato e tempistiche di eliminazione della doppia imposizione economica.",
    meta: "Scheda demo · profili procedurali",
  },
  {
    title: "Scambio di informazioni e cooperazione amministrativa",
    description:
      "Sintesi demo sui flussi informativi tra amministrazioni rilevanti per l'analisi dei rapporti infragruppo.",
    meta: "Scheda demo · profili procedurali",
  },
  {
    title: "Aiuti di Stato e vantaggi fiscali selettivi",
    description:
      "Sintesi demo sull'uso del principio di libera concorrenza come parametro nelle valutazioni di selettività.",
    meta: "Scheda demo · profili sostanziali",
  },
];

function UePage() {
  return (
    <>
      <PageHeader eyebrow="Normativa e prassi · Unione europea" title={TITLE} intro={DESCRIPTION} />
      <Prose>
        <div className="mb-6 flex items-center gap-3">
          <DemoBadge />
          <p className="text-sm text-muted-foreground">
            Schede sintetiche predisposte per il prototipo.
          </p>
        </div>
        <ReferenceList items={ITEMS} />
      </Prose>
    </>
  );
}