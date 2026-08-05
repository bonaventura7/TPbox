import { createFileRoute, notFound } from "@tanstack/react-router";

import { AreaNav } from "@/components/news/AreaNav";
import { AttualitaFeed } from "@/components/news/AttualitaFeed";
import { PageHeader } from "@/components/site/SectionPage";
import type { NewsFilters } from "@/lib/domain/types";

type AreaKey = "ocse" | "unione-europea" | "italia";

const AREA_CONFIG: Record<
  AreaKey,
  { geo: Exclude<NewsFilters["geo"], "TUTTE">; title: string; description: string; eyebrow: string }
> = {
  ocse: {
    geo: "OCSE",
    eyebrow: "Attualità · OCSE",
    title: "Attualità OCSE",
    description:
      "Aggiornamenti dalle fonti OCSE su linee guida, metodi e prassi in materia di prezzi di trasferimento, con metadati verificabili e collegamento al documento originale.",
  },
  "unione-europea": {
    geo: "UE",
    eyebrow: "Attualità · Unione europea",
    title: "Attualità Unione europea",
    description:
      "Aggiornamenti dalle fonti dell'Unione europea rilevanti per i prezzi di trasferimento e per la fiscalità del mercato interno.",
  },
  italia: {
    geo: "ITALIA",
    eyebrow: "Attualità · Italia",
    title: "Attualità Italia",
    description:
      "Aggiornamenti dalle fonti italiane su disciplina interna, prassi amministrativa e adempimenti documentali in materia di prezzi di trasferimento.",
  },
};

function isAreaKey(value: string): value is AreaKey {
  return value === "ocse" || value === "unione-europea" || value === "italia";
}

export const Route = createFileRoute("/attualita/$area")({
  beforeLoad: ({ params }) => {
    if (!isAreaKey(params.area)) throw notFound();
  },
  head: ({ params }) => {
    if (!isAreaKey(params.area)) {
      return {
        meta: [{ title: "Area non disponibile" }, { name: "robots", content: "noindex" }],
      };
    }
    const area = AREA_CONFIG[params.area];
    return {
      meta: [
        { title: `${area.title} — Osservatorio Transfer Pricing` },
        { name: "description", content: area.description },
        { property: "og:title", content: area.title },
        { property: "og:description", content: area.description },
      ],
    };
  },
  component: AttualitaArea,
  notFoundComponent: AreaNotFound,
});

function AttualitaArea() {
  const { area } = Route.useParams();
  if (!isAreaKey(area)) return <AreaNotFound />;
  const config = AREA_CONFIG[area];

  return (
    <>
      <PageHeader eyebrow={config.eyebrow} title={config.title} intro={config.description} />
      <AreaNav />
      <AttualitaFeed fixedGeo={config.geo} />
    </>
  );
}

function AreaNotFound() {
  return (
    <>
      <PageHeader
        eyebrow="Attualità"
        title="Area non disponibile"
        intro="L'area richiesta non è presente. Consulta il feed completo oppure una delle aree disponibili."
      />
      <AreaNav />
    </>
  );
}
