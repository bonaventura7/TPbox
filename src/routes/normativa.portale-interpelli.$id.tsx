import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { DemoBadge } from "@/components/site/DemoBadge";
import { Button } from "@/components/ui/button";
import {
  INTERPELLI_SOURCE_URL,
  isTransferPricingRecord,
  subjectLabel,
} from "@/lib/domain/interpelli";
import { getInterpello } from "@/lib/portal.functions";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["interpelli", "detail", id],
    queryFn: () => getInterpello({ data: { id } }),
  });

export const Route = createFileRoute("/normativa/portale-interpelli/$id")({
  loader: async ({ context, params }) => {
    const record = await context.queryClient.ensureQueryData(detailQuery(params.id));
    if (!record) throw notFound();
    return { title: record.title, number: record.number };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Scheda non disponibile" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `Risposta n. ${loaderData.number} — ${loaderData.title}`;
    const description =
      "Scheda redazionale dimostrativa di una risposta a interpello pubblicata dall'Agenzia delle Entrate.";
    return {
      meta: [
        { title: `${title} — Portale interpelli` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: InterpelloDetail,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-serif text-2xl">Scheda non trovata</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        La scheda richiesta non è presente nell'archivio dimostrativo.
      </p>
      <Link
        to="/normativa/portale-interpelli"
        className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Torna al Portale interpelli
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16" role="alert">
      <h1 className="font-serif text-2xl">Scheda non disponibile</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        La consultazione non è momentaneamente disponibile. Riprova tra qualche istante.
      </p>
    </div>
  ),
});

const DATE = new Intl.DateTimeFormat("it-IT", { dateStyle: "long" });

function formatDate(value: string) {
  return DATE.format(new Date(`${value}T00:00:00Z`));
}

function InterpelloDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(id));

  if (!data) return null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        to="/normativa/portale-interpelli"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Torna alla ricerca
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs tracking-wide text-muted-foreground uppercase">
        <span className="text-petrol">
          Risposta n. {data.number} del {formatDate(data.publicationDate)}
        </span>
        {isTransferPricingRecord(data) ? (
          <span className="border border-petrol px-2 py-0.5 text-[0.7rem] text-petrol">
            Transfer Pricing
          </span>
        ) : null}
        <DemoBadge />
      </div>

      <h1 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{data.title}</h1>

      <dl className="mt-6 grid gap-2 border border-border bg-card p-5 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="font-medium">Materia</dt>
          <dd className="text-muted-foreground">{subjectLabel(data.subject)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Sotto-materia</dt>
          <dd className="text-muted-foreground">{data.subSubject ?? "Non specificata"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Fonte</dt>
          <dd className="text-muted-foreground">{data.sourceName} · istituzionale</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Ultima verifica</dt>
          <dd className="text-muted-foreground">
            <time dateTime={data.lastVerifiedAt}>{formatDate(data.lastVerifiedAt)}</time>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Stato editoriale</dt>
          <dd className="text-muted-foreground">{data.workflowStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Anno</dt>
          <dd className="text-muted-foreground">{data.year}</dd>
        </div>
      </dl>

      <section aria-labelledby="sintesi" className="mt-10">
        <h2 id="sintesi" className="font-serif text-2xl">
          Sintesi redazionale
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {data.abstract}
        </p>
      </section>

      <section aria-labelledby="questione" className="mt-8">
        <h2 id="questione" className="font-serif text-2xl">
          Questione interpretativa
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {data.question}
        </p>
      </section>

      <section aria-labelledby="soluzione" className="mt-8">
        <h2 id="soluzione" className="font-serif text-2xl">
          Soluzione dell'Agenzia in forma sintetica
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {data.answerSummary}
        </p>
      </section>

      <section aria-labelledby="norme" className="mt-8">
        <h2 id="norme" className="font-serif text-2xl">
          Norme richiamate
        </h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
          {data.legalReferences.map((item) => (
            <li key={item} className="border-l-2 border-border pl-3">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="temi" className="mt-8">
        <h2 id="temi" className="font-serif text-2xl">
          Temi correlati
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {[...data.relatedTopics, ...data.tags].map((topic) => (
            <li
              key={topic}
              className="border border-border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {topic}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 border-l-2 border-gold bg-secondary/60 p-6">
        <h2 className="font-serif text-xl">Avvertenza</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          I contenuti di questa scheda sono dimostrativi e redazionali: la sintesi non
          sostituisce il documento ufficiale, che resta l'unico testo di riferimento.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild variant="outline" className="min-h-11">
            <a href={data.officialUrl} target="_blank" rel="noreferrer noopener">
              Apri fonte ufficiale
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">(si apre in una nuova finestra)</span>
            </a>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <a href={INTERPELLI_SOURCE_URL} target="_blank" rel="noreferrer noopener">
              Agenzia delle Entrate — Risposte agli interpelli
              <span className="sr-only">(si apre in una nuova finestra)</span>
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
