import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader } from "@/components/site/SectionPage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  INTERPELLI_SOURCE_URL,
  INTERPELLO_MATERIE,
  type InterpelloMateria,
  type InterpelloSort,
} from "@/lib/domain/interpelli";
import { searchInterpelli } from "@/lib/portal.functions";

const TITLE = "Portale interpelli";
const SUBTITLE = "Ricerca e consulta le risposte pubblicate dall'Agenzia delle Entrate";
const PAGE_SIZE = 6;

export const Route = createFileRoute("/tool/portale-interpelli")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: SUBTITLE },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: SUBTITLE },
    ],
  }),
  component: PortaleInterpelliPage,
});

interface AppliedFilters {
  query: string;
  materie: InterpelloMateria[];
  year: number | null;
  sort: InterpelloSort;
  page: number;
}

const INITIAL: AppliedFilters = {
  query: "",
  materie: [],
  year: null,
  sort: "RECENT_FIRST",
  page: 1,
};

const DATE = new Intl.DateTimeFormat("it-IT", { dateStyle: "long" });

function formatDate(value: string) {
  return DATE.format(new Date(`${value}T00:00:00Z`));
}

function PortaleInterpelliPage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftMaterie, setDraftMaterie] = useState<InterpelloMateria[]>([]);
  const [draftYear, setDraftYear] = useState<string>("ALL");
  const [applied, setApplied] = useState<AppliedFilters>(INITIAL);

  const run = useServerFn(searchInterpelli);
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: ["interpelli", applied],
    queryFn: () => run({ data: { ...applied, pageSize: PAGE_SIZE } }),
  });

  const years = data?.availableYears ?? [];

  function toggleMateria(value: InterpelloMateria, checked: boolean) {
    setDraftMaterie((prev) =>
      checked ? [...prev, value] : prev.filter((item) => item !== value),
    );
  }

  function apply() {
    setApplied({
      query: draftQuery,
      materie: draftMaterie,
      year: draftYear === "ALL" ? null : Number(draftYear),
      sort: applied.sort,
      page: 1,
    });
  }

  function reset() {
    setDraftQuery("");
    setDraftMaterie([]);
    setDraftYear("ALL");
    setApplied(INITIAL);
  }

  const statusMessage = isPending
    ? "Caricamento delle risposte in corso."
    : isError
      ? "Elenco non disponibile a causa di un errore temporaneo."
      : data
        ? `${data.total} risposte trovate. Pagina ${data.page} di ${data.totalPages}.`
        : "";

  return (
    <>
      <PageHeader eyebrow="Tool" title={TITLE} intro={SUBTITLE} />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <form
          className="border border-border bg-card p-5 sm:p-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Label htmlFor="interpelli-query">
                Cerca per parola chiave, numero o argomento
              </Label>
              <Input
                id="interpelli-query"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Es. documentazione, 14/2026, stabile organizzazione"
                className="mt-2 min-h-11"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="interpelli-year">Anno di pubblicazione</Label>
              <Select value={draftYear} onValueChange={setDraftYear}>
                <SelectTrigger id="interpelli-year" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tutti gli anni</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="text-xs tracking-wide text-muted-foreground uppercase">
              Materia (selezione multipla)
            </legend>
            <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {INTERPELLO_MATERIE.map((value) => {
                const id = `materia-${value.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
                return (
                  <div key={value} className="flex items-center gap-2 py-1">
                    <Checkbox
                      id={id}
                      checked={draftMaterie.includes(value)}
                      onCheckedChange={(checked) => toggleMateria(value, checked === true)}
                    />
                    <Label htmlFor={id} className="text-sm font-normal">
                      {value}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" className="min-h-11">
                <Search aria-hidden="true" />
                Applica filtri
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={reset}
              >
                <RotateCcw aria-hidden="true" />
                Reimposta
              </Button>
            </div>
            <div className="min-w-0 sm:w-64">
              <Label htmlFor="interpelli-sort">Ordinamento</Label>
              <Select
                value={applied.sort}
                onValueChange={(value) =>
                  setApplied((prev) => ({
                    ...prev,
                    sort: value as InterpelloSort,
                    page: 1,
                  }))
                }
              >
                <SelectTrigger id="interpelli-sort" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECENT_FIRST">Dal più recente</SelectItem>
                  <SelectItem value="OLDEST_FIRST">Dal meno recente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        <p aria-live="polite" role="status" className="mt-4 text-sm text-muted-foreground">
          {statusMessage}
        </p>

        {data && data.serviceStatus !== "OK" && !isError ? (
          <div className="mt-4 border-l-2 border-gold bg-gold/10 p-5 text-sm">
            <h2 className="font-serif text-lg">
              {data.serviceStatus === "DEGRADED"
                ? "Servizio in modalità ridotta"
                : "Verifica della fonte in corso"}
            </h2>
            <p className="mt-2 text-muted-foreground">{data.message}</p>
          </div>
        ) : null}

        {isError ? (
          <div
            role="alert"
            className="mt-4 border-l-2 border-destructive bg-destructive/5 p-5"
          >
            <h2 className="font-serif text-xl">Elenco non disponibile</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              La consultazione non è momentaneamente disponibile. Puoi ripetere la
              richiesta tra qualche istante.
            </p>
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : null}

        {data && data.items.length === 0 && !isPending ? (
          <div className="mt-6 border border-dashed border-border bg-secondary/40 p-8 text-center">
            <h2 className="font-serif text-lg">Nessuna risposta corrisponde ai filtri</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Riduci il testo cercato, seleziona meno materie oppure rimuovi il filtro
              sull'anno.
            </p>
          </div>
        ) : null}

        {data && data.items.length > 0 ? (
          <section aria-labelledby="risposte" className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="risposte" className="font-serif text-2xl">
                Risposte agli interpelli
              </h2>
              <DemoBadge />
            </div>

            <ul
              className={
                isFetching
                  ? "mt-4 grid gap-4 opacity-60 md:grid-cols-2"
                  : "mt-4 grid gap-4 md:grid-cols-2"
              }
            >
              {data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col border border-border bg-card p-5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs tracking-wide text-muted-foreground uppercase">
                    <span className="text-petrol">Risposta n. {item.responseNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.materia}</span>
                  </div>
                  <h3 className="mt-3 font-serif text-lg leading-snug">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.abstract}
                  </p>
                  <dl className="mt-4 grid gap-1 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground/80">Pubblicazione</dt>
                      <dd>
                        <time dateTime={item.publishedAt}>
                          {formatDate(item.publishedAt)}
                        </time>
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground/80">Fonte</dt>
                      <dd>{item.sourceName} · istituzionale</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground/80">Ultima verifica</dt>
                      <dd>
                        <time dateTime={item.lastVerifiedAt}>
                          {formatDate(item.lastVerifiedAt)}
                        </time>
                      </dd>
                    </div>
                  </dl>
                  {item.keywords.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {item.keywords.map((keyword) => (
                        <li
                          key={keyword}
                          className="border border-border px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {keyword}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-5 flex items-center gap-3">
                    <Button asChild variant="outline" className="min-h-11">
                      <a
                        href={item.officialUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Apri la risposta ufficiale
                        <ExternalLink aria-hidden="true" />
                        <span className="sr-only">(si apre in una nuova finestra)</span>
                      </a>
                    </Button>
                    {item.status === "STALE" ? (
                      <span className="text-xs text-muted-foreground">
                        In attesa di nuova verifica
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {data.totalPages > 1 ? (
              <nav
                aria-label="Paginazione dei risultati"
                className="mt-8 flex items-center justify-between gap-4"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={data.page <= 1}
                  onClick={() =>
                    setApplied((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                  }
                >
                  Pagina precedente
                </Button>
                <p className="text-sm text-muted-foreground">
                  Pagina {data.page} di {data.totalPages}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={data.page >= data.totalPages}
                  onClick={() =>
                    setApplied((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                >
                  Pagina successiva
                </Button>
              </nav>
            ) : null}
          </section>
        ) : null}

        <section
          aria-labelledby="trasparenza-interpelli"
          className="mt-12 border-l-2 border-gold bg-secondary/60 p-6 sm:p-8"
        >
          <h2 id="trasparenza-interpelli" className="font-serif text-2xl">
            Trasparenza sui dati
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            I dati mostrati nel prototipo sono dimostrativi. La versione operativa
            collegherà ogni risultato alla fonte ufficiale dell'Agenzia delle Entrate.
          </p>
          <p className="mt-4 text-sm">
            <a
              href={INTERPELLI_SOURCE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-petrol underline underline-offset-4"
            >
              Agenzia delle Entrate — Risposte agli interpelli
              <span className="sr-only">(si apre in una nuova finestra)</span>
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
