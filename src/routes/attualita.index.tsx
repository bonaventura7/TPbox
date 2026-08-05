import { createFileRoute } from "@tanstack/react-router";

import { AreaNav } from "@/components/news/AreaNav";
import { AttualitaFeed } from "@/components/news/AttualitaFeed";
import { PageHeader } from "@/components/site/SectionPage";

const TITLE = "Attualità sul transfer pricing";
const DESCRIPTION =
  "Notizia principale, ultime notizie e archivio cronologico con ricerca, filtri per area geografica e tema e selezione delle sole fonti istituzionali.";

export const Route = createFileRoute("/attualita/")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: AttualitaIndex,
});

function AttualitaIndex() {
  return (
    <>
      <PageHeader eyebrow="Attualità" title={TITLE} intro={DESCRIPTION} />
      <AreaNav />
      <AttualitaFeed />
    </>
  );
}
