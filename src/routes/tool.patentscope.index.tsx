import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchPatents } from "@/lib/portal.functions";
import type { PatentSort } from "@/lib/patents/types";

const TITLE = "Patent & IP Explorer";
const SUBTITLE =
  "Cerca brevetti e asset intangibili rilevanti per il transfer pricing direttamente nel portale.";
const PAGE_SIZE = 6;

const ANY = "__ANY__";

const indexQuery = queryOptions({
  queryKey: ["patents", "index"],
  queryFn: () =>
    searchPatents({
      data: { query: "", pageSize: 50, page: 1, sort: "DATA_DESC" },
    }),
});

export const Route = createFileRoute("/tool/patentscope/")({
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
    await context.queryClient.ensureQueryData(indexQuery);
  },
  component: PatentExplorer,
  pendingComponent: () => (
    <p className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">
      Caricamento dell'indice brevetti in corso…
    </p>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-16" role="alert">
      <h1 className="font-serif text-2xl">Ricerca non disponibile</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Il motore di ricerca non è momentaneamente raggiungibile. Riprova tra qualche
        istante.
      </p>
    </div>
  ),
});

const DATE = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeZone: "Europe/Rome",
});

function formatDate(value: string) {
  return DATE.format(new Date(`${value}T00:00:00Z`));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function PatentExplorer() {
  const { data } = useSuspenseQuery(indexQuery);

  const [query, setQuery] = useState("");
  const [applicant, setApplicant] = useState("");
  const [ipc, setIpc] = useState("");
  const [jurisdiction, setJurisdiction] = useState(ANY);
  const [technologyArea, setTechnologyArea] = useState(ANY);
  const [year, setYear] = useState(ANY);
  const [sort, setSort] = useState<PatentSort>("DATA_DESC");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter((t) => t.length > 1);
    const applicantTerm = normalize(applicant);
    const ipcTerm = normalize(ipc);

    const matches = data.items.filter((record) => {
      const haystack = normalize(
        [
          record.publicationNumber,
          record.title,
          record.abstract,
          record.technologyArea,
          record.tpRelevance,
          ...record.applicants,
          ...record.inventors,
          ...record.ipcCodes,
        ].join(" "),
      );
      if (terms.some((term) => !haystack.includes(term))) return false;
      if (
        applicantTerm &&
        !record.applicants.some((name) => normalize(name).includes(applicantTerm))
      ) {
        return false;
      }
      if (ipcTerm && !record.ipcCodes.some((code) => normalize(code).includes(ipcTerm))) {
        return false;
      }
      if (jurisdiction !== ANY && !record.jurisdictions.includes(jurisdiction)) return false;
      if (technologyArea !== ANY && record.technologyArea !== technologyArea) return false;
      if (year !== ANY && !record.publicationDate.startsWith(year)) return false;
      return true;
    });

    return [...matches].sort((a, b) => {
      if (sort === "DATA_ASC") return a.publicationDate.localeCompare(b.publicationDate);
      if (sort === "FAMIGLIA_DESC") return b.familySize - a.familySize;
      if (sort === "RELEVANZA") return b.familySize - a.familySize;
      return b.publicationDate.localeCompare(a.publicationDate);
    });
  }, [applicant, data.items, ipc, jurisdiction, query, sort, technologyArea, year]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function reset() {
    setQuery("");
    setApplicant("");
    setIpc("");
    setJurisdiction(ANY);
    setTechnologyArea(ANY);
    setYear(ANY);
    setSort("DATA_DESC");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Tool
        </p>
        <h1 className="mt-2 font-serif text-3xl md:text-4xl">{TITLE}</h1>
        <p className="mt-3 text-muted-foreground">{SUBTITLE}</p>
      </header>

      <section
        aria-labelledby="ricerca-brevetti"
        className="mt-8 rounded-lg border bg-card p-5"
      >
        <h2 id="ricerca-brevetti" className="font-serif text-lg">
          Ricerca
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Label htmlFor="patent-query">Parola chiave, numero o tecnologia</Label>
            <div className="relative mt-1.5">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="patent-query"
                className="pl-9"
                value={query}
                placeholder="es. batterie, WO/2023/114872, intelligenza artificiale"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="patent-applicant">Titolare</Label>
            <Input
              id="patent-applicant"
              className="mt-1.5"
              value={applicant}
              placeholder="es. Alfa Industrial Holding"
              onChange={(event) => {
                setApplicant(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <Label htmlFor="patent-ipc">Classificazione IPC</Label>
            <Input
              id="patent-ipc"
              className="mt-1.5"
              value={ipc}
              placeholder="es. G06Q"
              onChange={(event) => {
                setIpc(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <Label htmlFor="patent-area">Area tecnologica</Label>
            <Select
              value={technologyArea}
              onValueChange={(value) => {
                setTechnologyArea(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="patent-area" className="mt-1.5">
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutte le aree</SelectItem>
                {data.facets.technologyAreas.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="patent-jurisdiction">Giurisdizione</Label>
            <Select
              value={jurisdiction}
              onValueChange={(value) => {
                setJurisdiction(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="patent-jurisdiction" className="mt-1.5">
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutte</SelectItem>
                {data.facets.jurisdictions.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="patent-year">Anno di pubblicazione</Label>
            <Select
              value={year}
              onValueChange={(value) => {
                setYear(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="patent-year" className="mt-1.5">
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti gli anni</SelectItem>
                {data.facets.years.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="patent-sort">Ordinamento</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as PatentSort)}>
              <SelectTrigger id="patent-sort" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DATA_DESC">Più recenti</SelectItem>
                <SelectItem value="DATA_ASC">Meno recenti</SelectItem>
                <SelectItem value="FAMIGLIA_DESC">Famiglia più ampia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {filtered.length === 0
              ? "Nessun risultato"
              : `${filtered.length} risultat${filtered.length === 1 ? "o" : "i"} — pagina ${currentPage} di ${totalPages}`}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" />
            Azzera filtri
          </Button>
        </div>
      </section>

      {data.status === "DEGRADED" || data.status === "STALE" ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-dashed bg-muted p-4 text-sm text-muted-foreground"
        >
          {data.message ??
            "Servizio in modalità ridotta: stiamo mostrando i dati già pubblicati nel portale."}
        </p>
      ) : null}

      <section aria-label="Risultati" className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nessun brevetto corrisponde ai criteri impostati. Prova a ridurre i filtri o a
            usare termini più generali.
          </p>
        ) : (
          visible.map((record) => (
            <article key={record.id} className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 font-medium">
                  {record.publicationNumber}
                </span>
                <span>{record.technologyArea}</span>
                <span aria-hidden="true">·</span>
                <span>Pubblicazione {formatDate(record.publicationDate)}</span>
                <span aria-hidden="true">·</span>
                <span>Famiglia: {record.familySize}</span>
                <span className="rounded border border-dashed px-2 py-0.5">DEMO</span>
              </div>

              <h3 className="mt-2 font-serif text-xl">
                <Link
                  to="/tool/patentscope/$id"
                  params={{ id: record.id }}
                  className="underline-offset-4 hover:underline"
                >
                  {record.title}
                </Link>
              </h3>

              <p className="mt-2 text-sm text-muted-foreground">{record.abstract}</p>

              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase">Titolari</dt>
                  <dd>{record.applicants.join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase">
                    Giurisdizioni
                  </dt>
                  <dd>{record.jurisdictions.join(" · ")}</dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </section>

      {totalPages > 1 ? (
        <nav aria-label="Paginazione risultati" className="mt-6 flex justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Pagina precedente
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Pagina successiva
          </Button>
        </nav>
      ) : null}

      <p className="mt-10 rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
        Trasparenza: l'indice è alimentato lato server e i dati mostrati in questa fase sono
        sintetici e marcati DEMO. Ultimo allineamento dell'indice:{" "}
        {DATE.format(new Date(data.lastSyncAt))}. Nessuna interrogazione parte dal browser.
      </p>
    </div>
  );
}
