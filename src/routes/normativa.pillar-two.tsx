import { createFileRoute } from "@tanstack/react-router";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader, Prose, ReferenceList } from "@/components/site/SectionPage";

const TITLE = "Pillar Two e transfer pricing";
const DESCRIPTION =
  "Imposizione minima globale e interazione con le rettifiche dei prezzi di trasferimento: profili di calcolo, safe harbour e coordinamento.";

export const Route = createFileRoute("/normativa/pillar-two")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: PillarTwoPage,
});

const ITEMS = [
  {
    title: "Aliquota effettiva e rettifiche di fine esercizio",
    description:
      "Scheda demo sull'impatto degli aggiustamenti di transfer pricing sul reddito rilevante e sulle imposte considerate.",
    meta: "Scheda demo · profili di calcolo",
  },
  {
    title: "Safe harbour transitori",
    description:
      "Scheda demo sui test basati sulla rendicontazione paese per paese e sulla coerenza dei dati con la documentazione infragruppo.",
    meta: "Scheda demo · semplificazioni",
  },
  {
    title: "Coordinamento tra rettifiche primarie e imposizione minima",
    description:
      "Scheda demo sul rischio di sovrapposizione tra recuperi nazionali e imposta integrativa.",
    meta: "Scheda demo · coordinamento",
  },
  {
    title: "Dati e governance del dato fiscale",
    description:
      "Scheda demo sui requisiti informativi e sulla tracciabilità dei dati economico-finanziari utilizzati nei calcoli.",
    meta: "Scheda demo · adempimenti",
  },
];

function PillarTwoPage() {
  return (
    <>
      <PageHeader eyebrow="Normativa e prassi · Pillar Two" title={TITLE} intro={DESCRIPTION} />
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