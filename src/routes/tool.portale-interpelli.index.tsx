import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ExternalLink, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { DemoBadge } from "@/components/site/DemoBadge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Switch } from "@/components/ui/switch";
import {
  INTERPELLI_SOURCE_URL,
  INTERPELLO_SUBJECTS,
  isTransferPricingRecord,
  subjectLabel,
  type InterpelloRecord,
  type InterpelloSort,
  type InterpelloSubjectId,
} from "@/lib/domain/interpelli";
import { getInterpelliArchive } from "@/lib/portal.functions";

const TITLE = "Portale interpelli";
const SUBTITLE =
  "Ricerca e consulta le risposte agli interpelli pubblicate dall'Agenzia delle Entrate";
const PAGE_SIZE = 6;

const archiveQuery = queryOptions({
  queryKey: ["interpelli", "archive"],
  queryFn: () => getInterpelliArchive(),
});

export const Route = createFileRoute("/tool/portale-interpelli/")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: SUBTITLE },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: SUBTITLE },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(archiveQuery);
  },
  component: PortaleInterpelli,
  pendingComponent: () => (
    <p className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">
      Caricamento dell'archivio in corso…
    </p>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-16" role="alert">
      <h1 className="font-serif text-2xl">Archivio non disponibile</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        La consultazione non è momentaneamente disponibile. Puoi ripetere la richiesta
        tra qualche istante.
      </p>
    </div>
  ),
});

const DATE = new Intl.DateTimeFormat("it-IT", { dateStyle: "long" });

function formatDate(value: string) {
  return DATE.format(new Date(`${value}T00:00:00Z`));
}

/** Ricerca full-text lato client: frase esatta tra virgolette o combinazione di termini. */
function matchesQuery(item: InterpelloRecord, raw: string): boolean {
  const term = raw.trim().toLowerCase();
  if (term.length === 0) return true;
  const haystack = [
    item.title,
    item.number,
    item.abstract,
    subjectLabel(item.subject),
    item.subSubject ?? "",
    item.question,
    ...item.tags,
    ...item.legalReferences,
  ]
    .join(" ")
    .toLowerCase();

  const phrases = [...term.matchAll(/"([^"]+)"/g)].map((match) => match[1]!.trim());
  const rest = term.replace(/"[^"]*"/g, " ");
  const words = rest.split(/\s+/).filter((word) => word.length > 0);

  return (
    phrases.every((phrase) => haystack.includes(phrase)) &&
    words.every((word) => haystack.includes(word))
  );
}

function PortaleInterpelli() {
  const { data } = useSuspenseQuery(archiveQuery);

  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<InterpelloSubjectId[]>([]);
  const [subSubjects, setSubSubjects] = useState<string[]>([]);
  const [year, setYear] = useState("ALL");
  const [numberFilter, setNumberFilter] = useState("");
  const [tpOnly, setTpOnly] = useState(false);
  const [sort, setSort] = useState<InterpelloSort>("RECENT_FIRST");
  const [page, setPage] = useState(1);

  function update<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  const results = useMemo(() => {
    const filtered = data.records.filter((item) => {
      if (subjects.length > 0 && !subjects.includes(item.subject)) return false;
      if (
        subSubjects.length > 0 &&
        (item.subSubject === null || !subSubjects.includes(item.subSubject))
      )
        return false;
      if (year !== "ALL" && item.year !== Number(year)) return false;
      if (
        numberFilter.trim().length > 0 &&
        !item.number.toLowerCase().includes(numberFilter.trim().toLowerCase())
      )
        return false;
      if (tpOnly && !isTransferPricingRecord(item)) return false;
      return matchesQuery(item, query);
    });

    return filtered.sort((a, b) =>
      sort === "RECENT_FIRST"
        ? b.publicationDate.localeCompare(a.publicationDate)
        : a.publicationDate.localeCompare(b.publicationDate),
    );
  }, [data.records, subjects, subSubjects, year, numberFilter, tpOnly, query, sort]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const chips = [
    ...(query.trim().length > 0
      ? [{ key: "query", label: `Ricerca: ${query.trim()}`, clear: () => setQuery("") }]
      : []),
    ...subjects.map((id) => ({
      key: `subject-${id}`,
      label: subjectLabel(id),
      clear: () => update(setSubjects, subjects.filter((value) => value !== id)),
    })),
    ...subSubjects.map((value) => ({
      key: `sub-${value}`,
      label: value,
      clear: () =>
        update(setSubSubjects, subSubjects.filter((item) => item !== value)),
    })),
    ...(year !== "ALL"
      ? [{ key: "year", label: `Anno ${year}`, clear: () => update(setYear, "ALL") }]
      : []),
    ...(numberFilter.trim().length > 0
      ? [
          {
            key: "number",
            label: `Numero ${numberFilter.trim()}`,
            clear: () => update(setNumberFilter, ""),
          },
        ]
      : []),
    ...(tpOnly
      ? [
          {
            key: "tp",
            label: "Solo transfer pricing e fiscalità internazionale",
            clear: () => update(setTpOnly, false),
          },
        ]
      : []),
  ];

  function resetAll() {
    setQuery("");
    setSubjects([]);
    setSubSubjects([]);
    setYear("ALL");
    setNumberFilter("");
    setTpOnly(false);
    setSort("RECENT_FIRST");
    setPage(1);
  }

  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">Tool</p>
          <h1 className="mt-3 max-w-3xl font-serif text-3xl leading-tight sm:text-4xl">
            {TITLE}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {SUBTITLE}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center border border-petrol px-2 py-0.5 text-[0.7rem] font-medium tracking-wide text-petrol uppercase">
              Fonte istituzionale
            </span>
            <DemoBadge />
            <span className="text-xs text-muted-foreground">
              Dati dimostrativi · ultima verifica {formatDate(data.lastVerifiedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside aria-label="Filtri di ricerca" className="min-w-0">
          <div className="border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-lg">Filtra per materia</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={resetAll}
              >
                <RotateCcw aria-hidden="true" />
                Reimposta
              </Button>
            </div>

            <Accordion type="multiple" className="mt-3">
              {INTERPELLO_SUBJECTS.map((subject) => (
                <AccordionItem key={subject.id} value={subject.id}>
                  <AccordionTrigger className="text-left text-sm">
                    {subject.label}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex items-center gap-2 py-1">
                      <Checkbox
                        id={`subject-${subject.id}`}
                        checked={subjects.includes(subject.id)}
                        onCheckedChange={(checked) =>
                          update(
                            setSubjects,
                            checked === true
                              ? [...subjects, subject.id]
                              : subjects.filter((value) => value !== subject.id),
                          )
                        }
                      />
                      <Label
                        htmlFor={`subject-${subject.id}`}
                        className="text-sm font-medium"
                      >
                        Tutta la materia
                      </Label>
                    </div>
                    {subject.subSubjects.map((sub) => {
                      const id = `sub-${sub.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
                      return (
                        <div key={sub} className="flex items-center gap-2 py-1">
                          <Checkbox
                            id={id}
                            checked={subSubjects.includes(sub)}
                            onCheckedChange={(checked) =>
                              update(
                                setSubSubjects,
                                checked === true
                                  ? [...subSubjects, sub]
                                  : subSubjects.filter((value) => value !== sub),
                              )
                            }
                          />
                          <Label htmlFor={id} className="text-sm font-normal">
                            {sub}
                          </Label>
                        </div>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="mt-4 border border-border bg-card p-5">
            <h2 className="font-serif text-lg">Altri filtri</h2>
            <div className="mt-4">
              <Label htmlFor="interpelli-year">Anno</Label>
              <Select value={year} onValueChange={(value) => update(setYear, value)}>
                <SelectTrigger id="interpelli-year" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tutti gli anni</SelectItem>
                  {data.availableYears.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4">
              <Label htmlFor="interpelli-number">Numero della risposta</Label>
              <Input
                id="interpelli-number"
                value={numberFilter}
                onChange={(event) => update(setNumberFilter, event.target.value)}
                placeholder="Es. 14/2026"
                className="mt-2 min-h-11"
              />
            </div>
            <div className="mt-5 flex items-start gap-3">
              <Switch
                id="interpelli-tp"
                checked={tpOnly}
                onCheckedChange={(checked) => update(setTpOnly, checked)}
              />
              <Label htmlFor="interpelli-tp" className="text-sm font-normal">
                Solo temi di transfer pricing e fiscalità internazionale
              </Label>
            </div>
            <div className="mt-5">
              <Label htmlFor="interpelli-sort">Ordinamento</Label>
              <Select
                value={sort}
                onValueChange={(value) => update(setSort, value as InterpelloSort)}
              >
                <SelectTrigger id="interpelli-sort" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECENT_FIRST">Data più recente</SelectItem>
                  <SelectItem value="OLDEST_FIRST">Data meno recente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </aside>

        <section aria-labelledby="risultati" className="min-w-0">
          <h2 id="risultati" className="sr-only">
            Risultati della ricerca
          </h2>

          <div className="border border-border bg-card p-5">
            <Label htmlFor="interpelli-query">
              Cerca nell'archivio delle risposte
            </Label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Input
                id="interpelli-query"
                type="search"
                value={query}
                onChange={(event) => update(setQuery, event.target.value)}
                placeholder="Cerca per parola, numero, norma o argomento"
                className="min-h-11"
              />
              <Button type="button" className="min-h-11 sm:w-auto" onClick={() => setPage(1)}>
                <Search aria-hidden="true" />
                Cerca
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Usa le virgolette per cercare una frase esatta, ad esempio &quot;stabile
              organizzazione&quot;.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p aria-live="polite" role="status" className="text-sm text-muted-foreground">
              {results.length === 1
                ? "1 risposta trovata"
                : `${results.length} risposte trovate`}
              {totalPages > 1 ? ` · pagina ${currentPage} di ${totalPages}` : ""}
            </p>
            {chips.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={resetAll}
              >
                Azzera filtri
              </Button>
            ) : null}
          </div>

          {chips.length > 0 ? (
            <ul aria-label="Filtri attivi" className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex min-h-9 items-center gap-2 border border-border bg-secondary/60 px-3 py-1 text-xs text-foreground transition-colors hover:border-petrol"
                  >
                    {chip.label}
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Rimuovi filtro</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {data.serviceStatus !== "OK" ? (
            <div className="mt-4 border-l-2 border-gold bg-gold/10 p-5 text-sm">
              <h3 className="font-serif text-lg">
                {data.serviceStatus === "DEGRADED"
                  ? "Servizio in modalità ridotta"
                  : "Verifica della fonte in corso"}
              </h3>
              <p className="mt-2 text-muted-foreground">{data.message}</p>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="mt-6 border border-dashed border-border bg-secondary/40 p-8 text-center">
              <h3 className="font-serif text-lg">
                Nessuna risposta corrisponde ai filtri
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Riduci il testo cercato, seleziona meno materie oppure rimuovi il filtro
                sull'anno.
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4">
              {visible.map((item) => (
                <li key={item.id} className="border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs tracking-wide text-muted-foreground uppercase">
                    <span className="text-petrol">
                      Risposta n. {item.number} del {formatDate(item.publicationDate)}
                    </span>
                    {isTransferPricingRecord(item) ? (
                      <span className="border border-petrol px-2 py-0.5 text-[0.7rem] text-petrol">
                        Transfer Pricing
                      </span>
                    ) : null}
                    <DemoBadge />
                  </div>

                  <h3 className="mt-3 font-serif text-xl leading-snug">
                    <Link
                      to="/tool/portale-interpelli/$id"
                      params={{ id: item.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {item.title}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.abstract}
                  </p>

                  <dl className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground/80">Materia</dt>
                      <dd>
                        {subjectLabel(item.subject)}
                        {item.subSubject ? ` · ${item.subSubject}` : ""}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground/80">Riferimenti</dt>
                      <dd>{item.legalReferences.join(" · ")}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground/80">Fonte</dt>
                      <dd>{item.sourceName}</dd>
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

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button asChild variant="outline" className="min-h-11">
                      <a href={item.officialUrl} target="_blank" rel="noreferrer noopener">
                        Apri fonte ufficiale
                        <ExternalLink aria-hidden="true" />
                        <span className="sr-only">(si apre in una nuova finestra)</span>
                      </a>
                    </Button>
                    <Link
                      to="/tool/portale-interpelli/$id"
                      params={{ id: item.id }}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-petrol underline underline-offset-4"
                    >
                      Scheda di dettaglio
                    </Link>
                    {item.workflowStatus === "STALE" ? (
                      <span className="text-xs text-muted-foreground">
                        In attesa di nuova verifica
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <nav
              aria-label="Paginazione dei risultati"
              className="mt-8 flex items-center justify-between gap-4"
            >
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Pagina precedente
              </Button>
              <p className="text-sm text-muted-foreground">
                Pagina {currentPage} di {totalPages}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Pagina successiva
              </Button>
            </nav>
          ) : null}

          <div className="mt-10 border-l-2 border-gold bg-secondary/60 p-6">
            <h3 className="font-serif text-xl">Trasparenza sui dati</h3>
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
          </div>
        </section>
      </div>
    </>
  );
}
