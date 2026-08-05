import { createFileRoute } from "@tanstack/react-router";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader, Prose, ReferenceList } from "@/components/site/SectionPage";

const TITLE = "Fonti OCSE sui prezzi di trasferimento";
const DESCRIPTION =
  "Linee guida, rapporti tematici e documenti di indirizzo OCSE rilevanti per l'applicazione del principio di libera concorrenza.";

export const Route = createFileRoute("/normativa/ocse")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: OcsePage,
});

const ITEMS = [
  {
    title: "Linee guida sui prezzi di trasferimento — capitoli generali",
    description:
      "Principio di libera concorrenza, analisi di comparabilità e criteri di selezione del metodo più appropriato alle circostanze del caso.",
    meta: "Scheda demo · fonte istituzionale primaria",
  },
  {
    title: "Analisi funzionale e allocazione dei rischi",
    description:
      "Individuazione delle funzioni significative, controllo dei rischi economicamente rilevanti e capacità finanziaria di assumerli.",
    meta: "Scheda demo · approfondimento metodologico",
  },
  {
    title: "Intangibili e remunerazione dei contributi al valore",
    description:
      "Titolarità economica, funzioni DEMPE e criteri di ripartizione dei rendimenti derivanti dagli intangibili di gruppo.",
    meta: "Scheda demo · approfondimento metodologico",
  },
  {
    title: "Operazioni finanziarie infragruppo",
    description:
      "Delimitazione dell'operazione finanziaria, capacità di indebitamento e determinazione del tasso di libera concorrenza.",
    meta: "Scheda demo · approfondimento metodologico",
  },
];

function OcsePage() {
  return (
    <>
      <PageHeader eyebrow="Normativa e prassi · OCSE" title={TITLE} intro={DESCRIPTION} />
      <Prose>
        <div className="mb-6 flex items-center gap-3">
          <DemoBadge />
          <p className="text-sm text-muted-foreground">
            Schede sintetiche predisposte per il prototipo: nessun testo ufficiale è
            riprodotto.
          </p>
        </div>
        <ReferenceList items={ITEMS} />
      </Prose>
    </>
  );
}