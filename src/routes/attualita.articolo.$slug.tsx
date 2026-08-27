import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ArticleBody } from "@/components/news/ArticleBody";
import { NewsMeta } from "@/components/news/NewsCard";
import { SourceBlock } from "@/components/news/SourceBlock";
import { DemoBadge } from "@/components/site/DemoBadge";
import { CATEGORY_COLORS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { getNewsArticle } from "@/lib/portal.functions";

const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["attualita", "articolo", slug],
    queryFn: () => getNewsArticle({ data: { slug } }),
  });

export const Route = createFileRoute("/attualita/articolo/$slug")({
  loader: async ({ context, params }) => {
    const item = await context.queryClient.ensureQueryData(articleQuery(params.slug));
    if (!item) throw notFound();
    return { title: item.title, summary: item.summary };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Articolo non disponibile" }, { name: "robots", content: "noindex" }],
      };
    }
    return {
      meta: [
        { title: `${loaderData.title} — Osservatorio Transfer Pricing` },
        { name: "description", content: loaderData.summary },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.summary },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ArticoloAttualita,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-serif text-2xl">Articolo non trovato</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        L&apos;articolo richiesto non è pubblicato, oppure il suo indirizzo è cambiato.
      </p>
      <Link
        to="/attualita"
        className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Torna all&apos;attualità
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16" role="alert">
      <h1 className="font-serif text-2xl">Articolo non disponibile</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        La consultazione non è momentaneamente disponibile. Riprova tra qualche istante.
      </p>
    </div>
  ),
});

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function ArticoloAttualita() {
  const { slug } = Route.useParams();
  const { data: item } = useSuspenseQuery(articleQuery(slug));

  if (!item) return null;

  const catColors = item.category ? CATEGORY_COLORS[item.category] : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        to="/attualita"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Torna all&apos;attualità
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-[0.7rem] tracking-wide uppercase">
        {item.category && catColors ? (
          <span
            className={cn(
              "border px-2 py-0.5 font-semibold",
              catColors.border,
              catColors.text,
              catColors.bg,
            )}
          >
            {item.category}
          </span>
        ) : null}
        {item.country ? (
          <span className="border border-border px-2 py-0.5 text-muted-foreground">
            {item.country}
          </span>
        ) : null}
        <span className="text-muted-foreground">{item.topic}</span>
        {item.isDemo ? <DemoBadge /> : null}
      </div>

      <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">{item.title}</h1>

      <p className="mt-3 text-sm text-muted-foreground">
        {formatDate(item.originalDate)} · {item.sourceName}
      </p>

      <p className="mt-6 border-l-2 border-petrol/40 pl-4 text-base leading-relaxed">
        {item.summary}
      </p>

      {item.body ? (
        <ArticleBody markdown={item.body} />
      ) : (
        <p className="mt-8 border border-dashed border-border p-4 text-sm text-muted-foreground">
          Il testo redazionale di questo articolo non è ancora disponibile. Restano consultabili il
          sommario qui sopra e il documento ufficiale qui sotto, che è la fonte su cui
          l&apos;articolo sarà basato.
        </p>
      )}

      <SourceBlock item={item} />

      <div className="mt-8">
        <NewsMeta item={item} />
      </div>
    </article>
  );
}
