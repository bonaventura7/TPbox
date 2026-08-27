import { ArrowRight, Download, FileText } from "lucide-react";

import { DemoBadge } from "@/components/site/DemoBadge";
import { articlePath } from "@/lib/domain/article";
import type { NewsItem } from "@/lib/domain/types";
import { CATEGORY_COLORS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * View-model locale della card: reviewedBy non fa parte del contratto NewsItem
 * corrente e resta opzionale finché il data wiring reale non lo espone.
 */
type NewsCardItem = NewsItem & {
  reviewedBy?: string | null;
};

const LANG_LABEL: Record<NewsItem["language"], string> = {
  it: "Italiano",
  en: "Inglese",
  fr: "Francese",
};

/** Emoji bandiera per paese (fallback al nome se non mappato). */
const COUNTRY_FLAG: Record<string, string> = {
  India: "🇮🇳",
  Germania: "🇩🇪",
  Belgio: "🇧🇪",
  "Paesi Bassi": "🇳🇱",
  Australia: "🇦🇺",
  Malaysia: "🇲🇾",
  Cipro: "🇨🇾",
  Italia: "🇮🇹",
  Francia: "🇫🇷",
  Giappone: "🇯🇵",
  Canada: "🇨🇦",
  "Regno Unito": "🇬🇧",
  "Stati Uniti": "🇺🇸",
  OCSE: "🌐",
  "Unione Europea": "🇪🇺",
};

function flagOf(country: string): string {
  return COUNTRY_FLAG[country] ?? "🌍";
}

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

export function NewsMeta({ item }: { item: NewsCardItem }) {
  const reviewer = item.reviewedBy?.trim() ?? "";

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
      <div className="flex min-w-0 gap-2">
        <dt className="shrink-0 text-muted-foreground">Fonte</dt>
        <dd className="min-w-0 truncate font-medium">{item.sourceName}</dd>
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
      {reviewer ? (
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">A cura di</dt>
          <dd className="font-medium">{reviewer}</dd>
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
  item: NewsCardItem;
  variant?: "list" | "featured" | "compact";
}) {
  const featured = variant === "featured";
  const catColors = item.category ? CATEGORY_COLORS[item.category] : null;

  /**
   * Collegamento interno alla pagina articolo. Ancora nativa e non `Link` del
   * router: la card è un componente puro, reso anche fuori da un RouterProvider
   * (SSR statico e test), e un `Link` in quel contesto solleva.
   */
  const href = articlePath(item);

  /**
   * Primo rimando della catena, quando è il documento: la card mostra soltanto
   * quello. La pagina che lo ospita resta nell'articolo, dove c'è spazio per
   * distinguerla.
   */
  const primo = buildSourceLinks(item)[0];
  const documento = primo?.kind === "DOCUMENTO" ? primo : null;

  return (
    <article
      className={cn(
        "border border-border bg-card p-5 sm:p-6",
        featured && "border-petrol/40 bg-surface p-6 sm:p-8",
      )}
    >
      {/* Badge row: categoria + paese + geo + topic */}
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] tracking-wide uppercase">
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
            {flagOf(item.country)} {item.country}
          </span>
        ) : (
          <span className="border border-petrol/50 px-2 py-0.5 text-petrol">{item.geo}</span>
        )}
        <span className="text-muted-foreground">{item.topic}</span>
        {item.isDemo ? <DemoBadge /> : null}
      </div>

      {/* Titolo */}
      <h3
        className={cn(
          "mt-3 font-serif leading-snug",
          featured ? "text-2xl sm:text-3xl" : variant === "compact" ? "text-base" : "text-xl",
        )}
      >
        <a href={href} className="underline-offset-4 hover:underline">
          {item.title}
        </a>
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

      {/* Meta (list / featured) oppure riga compatta */}
      {variant === "compact" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {item.sourceName} · {formatDate(item.originalDate)}
        </p>
      ) : (
        <NewsMeta item={item} />
      )}

      {/*
        Due azioni distinte: l'articolo redazionale e il documento su cui è
        basato. Il rimando al documento porta il suo titolo, così il lettore sa
        che cosa apre prima di lasciare la pagina.
      */}
      <div className="mt-4 flex flex-col gap-3">
        <a
          href={href}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-petrol underline underline-offset-4"
        >
          Leggi l&apos;articolo
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">: {item.title}</span>
        </a>
        {documento ? (
          <a
            href={documento.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-11 max-w-full items-start gap-2 self-start border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80"
          >
            {documento.download ? (
              <Download className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block">{documento.label}</span>
              <span className="mt-0.5 block font-normal text-muted-foreground">
                {documento.download ? "Scarica il documento" : "Apri il documento"}
              </span>
            </span>
          </a>
        ) : null}
      </div>
    </article>
  );
}
