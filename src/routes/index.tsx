import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { NewsCard } from "@/components/news/NewsCard";
import { Button } from "@/components/ui/button";
import { getNewsFeed } from "@/lib/portal.functions";

const TITLE = "Transfer Pricing, fonti e strumenti in un unico spazio";
const DESCRIPTION =
  "Attualità, normativa e prassi, giurisprudenza e strumenti di analisi sui prezzi di trasferimento, in un portale editoriale indipendente.";

const homeFeedQuery = queryOptions({
  queryKey: ["news-feed", "home"],
  queryFn: () => getNewsFeed({ data: {} }),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(homeFeedQuery);
  },
  component: Index,
  errorComponent: () => (
    <p className="mx-auto max-w-6xl px-4 py-16" role="alert">
      Il contenuto della home non è disponibile in questo momento.
    </p>
  ),
});

const QUICK_LINKS = [
  {
    to: "/normativa",
    label: "Normativa e prassi",
    text: "Linee guida OCSE, Country Profiles, fonti dell'Unione europea, disciplina italiana e Pillar Two.",
  },
  {
    to: "/giurisprudenza",
    label: "Giurisprudenza",
    text: "Rassegna ragionata delle pronunce rilevanti in materia di prezzi di trasferimento.",
  },
  {
    to: "/tool",
    label: "Tool",
    text: "Company Finder e Bilancio Finder per identificare società e consultarne i dati economici.",
  },
  {
    to: "/tool/portale-interpelli",
    label: "Portale interpelli",
    text: "Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate.",
  },
] as const;

function Index() {
  const { data } = useSuspenseQuery(homeFeedQuery);

  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">
            Portale indipendente
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.1] sm:text-5xl lg:text-6xl">
            {TITLE}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Selezione redazionale delle fonti istituzionali e professionali, con
            metadati verificabili e strumenti di analisi per chi lavora quotidianamente
            con i prezzi di trasferimento.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-11">
              <Link to="/attualita">Vai ad Attualità</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-11">
              <Link to="/tool/company-finder">Apri Company Finder</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {data.featured ? (
          <section aria-labelledby="in-evidenza">
            <h2
              id="in-evidenza"
              className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
            >
              Notizia in evidenza
            </h2>
            <div className="mt-4">
              <NewsCard item={data.featured} variant="featured" />
            </div>
          </section>
        ) : null}

        <section aria-labelledby="aggiornamenti" className="mt-16">
          <h2
            id="aggiornamenti"
            className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
          >
            Aggiornamenti recenti
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {data.latest.map((item) => (
              <li key={item.id}>
                <NewsCard item={item} variant="compact" />
              </li>
            ))}
          </ul>
          <Link
            to="/attualita"
            className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
          >
            Tutte le notizie e l'archivio
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="accessi-rapidi" className="mt-16">
          <h2
            id="accessi-rapidi"
            className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
          >
            Accessi rapidi
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <li key={link.to} className="border border-border bg-card p-6">
                <h3 className="font-serif text-xl">{link.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {link.text}
                </p>
                <Link
                  to={link.to}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
                >
                  Entra nella sezione
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="trasparenza"
          className="mt-16 border-l-2 border-gold bg-secondary/60 p-6 sm:p-8"
        >
          <h2 id="trasparenza" className="font-serif text-2xl">
            Trasparenza sui dati di questo prototipo
          </h2>
          <div className="mt-4 grid gap-4 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
            <p>
              Tutti i contenuti sono <strong className="text-foreground">dati demo
              sintetici</strong>: titoli, sintesi e valori economici non riproducono
              documenti reali.
            </p>
            <p>
              L'acquisizione delle fonti avviene solo lato server. Il browser non
              esegue alcuna chiamata verso siti esterni.
            </p>
            <p>
              Ogni elemento acquisito entra come bozza e diventa pubblico soltanto dopo
              revisione e approvazione redazionale.
            </p>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Elementi pubblicati in archivio demo: {data.totalPublished} · bozze in
            attesa di revisione: {data.draftsPending}
          </p>
        </section>
      </div>
    </>
  );
}
