import { Download, ExternalLink, MapPin } from "lucide-react";

import { DemoBadge } from "@/components/site/DemoBadge";
import type { NewsCategory, NewsItem } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const LANG_LABEL: Record<NewsItem["language"], string> = {
  it: "Italiano",
  en: "Inglese",
  fr: "Francese",
};

/** Colore badge per macro-categoria editoriale */
const CATEGORY_COLOR: Record<NewsCategory, string> = {
  "Transfer Pricing": "border-petrol/60 bg-petrol/10 text-petrol",
  "VAT": "border-amber-500/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  "Pillar Two": "border-blue-500/60 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  "Anti-Avoidance": "border-rose-500/60 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NewsMeta({ item }: { item: NewsItem }) {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
      <div className="flex min-w-0 gap-2">
        <dt className="shrink-0 text-muted-foreground">Fonte</dt>
        <dd className="min-w-0 truncate font-medium">{item.sourceName}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">Tipo fonte</dt>
        <dd className="font-medium">
          {item.sourceKind === "ISTITUZIONALE"
            ? "Istituzionale"
            : item.sourceKind === "PROFESSIONALE"
              ? "Professionale"
              : "Accademica"}{" "}
          · {item.sourceTier === "PRIMARY" ? "primaria" : "secondaria"}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">Data originale</dt>
        <dd className="font-medium">{formatDate(item.originalDate)}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">Lingua</dt>
        <dd className="font-medium">{LANG_LABEL[item.language]}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">Tema</dt>
        <dd className="font-medium">{item.topic}</dd>
      </div>
      {item.country ? (
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">Paese</dt>
          <dd className="font-medium">{item.country}</dd>
        </div>
      ) : null}
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">Ultima verifica</dt>
        <dd className="font-medium">{formatDateTime(item.lastVerifiedAt)}</dd>
      </div>
    </dl>
  );
}

export function NewsCard({
  item,
  variant = "list",
}: {
  item: NewsItem;
  variant?: "list" | "featured" | "compact";
}) {
  const featured = variant === "featured";

  return (
    <article
      className={cn(
        "border border-border bg-card p-5 sm:p-6",
        featured && "border-petrol/40 bg-surface p-6 sm:p-8",
      )}
    >
      {/* Badge riga superiore */}
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] tracking-wide uppercase">
        {/* Macro-categoria editoriale */}
        {item.category ? (
          <span
            className={cn(
              "border px-2 py-0.5 font-semibold",
              CATEGORY_COLOR[item.category],
            )}
          >
            {item.category}
          </span>
        ) : (
          <span className="border border-petrol/50 px-2 py-0.5 text-petrol">{item.geo}</span>
        )}
        {/* Paese specifico */}
        {item.country ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {item.country}
          </span>
        ) : null}
        <span className="text-muted-foreground">{item.topic}</span>
        <DemoBadge />
      </div>

      {/* Titolo */}
      <h3
        className={cn(
          "mt-3 font-serif leading-snug",
          featured ? "text-2xl sm:text-3xl" : variant === "compact" ? "text-base" : "text-xl",
        )}
      >
        {item.title}
      </h3>

      {/* Sommario */}
      <p
        className={cn(
          "mt-2 text-sm leading-relaxed text-muted-foreground",
          variant === "compact" && "line-clamp-3",
        )}
      >
        {item.summary}
      </p>

      {/* Meta dati */}
      {variant === "compact" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {item.country ? `${item.country} · ` : ""}
          {item.sourceName} · {formatDate(item.originalDate)}
        </p>
      ) : (
        <NewsMeta item={item} />
      )}

      {/* Azioni: fonte originale + PDF */}
      <div className="mt-4 flex flex-wrap gap-4">
        <a
          href={item.originalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-petrol underline underline-offset-4"
        >
          Apri la fonte originale
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(si apre in una nuova finestra)</span>
        </a>

        {item.pdfUrl ? (
          <a
            href={item.pdfUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-11 items-center gap-2 rounded border border-border bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/80"
            aria-label={`Scarica il documento PDF ufficiale: ${item.title}`}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Scarica PDF ufficiale
          </a>
        ) : null}
      </div>
    </article>
  );
}
