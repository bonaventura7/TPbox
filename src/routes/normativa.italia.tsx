import { createFileRoute } from "@tanstack/react-router";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader, Prose, ReferenceList } from "@/components/site/SectionPage";

const TITLE = "Disciplina e prassi italiana";
const DESCRIPTION =
  "Riferimenti interni, prassi amministrativa e adempimenti documentali applicabili alle imprese con operazioni infragruppo transfrontaliere.";

export const Route = createFileRoute("/normativa/italia")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ItaliaPage,
});

const ITEMS = [
  {
    title: "Principio di libera concorrenza nell'ordinamento interno",
    description:
      "Scheda demo sul rapporto tra norma interna, linee guida internazionali e criteri di valorizzazione delle operazioni infragruppo.",
    meta: "Scheda demo · disciplina sostanziale",
  },
  {
    title: "Documentazione idonea e regime premiale",
    description:
      "Scheda demo su struttura di master file e documentazione nazionale, tempistiche di predisposizione e effetti sulle sanzioni.",
    meta: "Scheda demo · adempimenti",
  },
  {
    title: "Accordi preventivi e procedure amichevoli",
    description:
      "Scheda demo su presupposti di accesso, contenuti dell'istanza e gestione della fase istruttoria.",
    meta: "Scheda demo · strumenti deflattivi",
  },
  {
    title: "Rettifiche in diminuzione e doppia imposizione",
    description:
      "Scheda demo sui presupposti per il riconoscimento delle rettifiche corrispondenti a seguito di accertamento estero.",
    meta: "Scheda demo · profili procedurali",
  },
];

function ItaliaPage() {
  return (
    <>
      <PageHeader eyebrow="Normativa e prassi · Italia" title={TITLE} intro={DESCRIPTION} />
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