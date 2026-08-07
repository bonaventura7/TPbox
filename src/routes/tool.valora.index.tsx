/**
 * Valora Suite — dashboard pubblica.
 * Nessun fetch esterno: il catalogo è tipizzato e locale.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";

import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  VALORA_CATALOG_VERSION,
  filterItems,
  getSource,
  valoraCatalog,
} from "../lib/valora/catalog";
import { inspectCatalog } from "../lib/valora/validator";
import { sourceStatusViews } from "../lib/valora/repository.mock";
import type { ValoraItem } from "../lib/valora/types";

const TITLE = "Valora Suite — costo del capitale e valutazione d'impresa";
const DESCRIPTION =
  "Catalogo di moduli per costo del capitale, premi per il rischio e valutazione: WACC, beta, country risk premium, credit spread e DCF, con fonti, versioni e stato di verifica in chiaro.";

interface ValoraSearch {
  q?: string;
  categoria?: string;
  stato?: string;
}

export const Route = createFileRoute("/tool/valora/")({
  validateSearch: (search: Record<string, unknown>): ValoraSearch => {
    const value = (key: string): string | undefined =>
      typeof search[key] === "string" && search[key] !== "" ? (search[key] as string) : undefined;
    const parsed: ValoraSearch = {};
    const q = value("q");
    if (q !== undefined) parsed.q = q;
    const categoria = value("categoria");
    if (categoria !== undefined) parsed.categoria = categoria;
    const stato = value("stato");
    if (stato !== undefined) parsed.stato = stato;
    return parsed;
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ValoraDashboard,
});

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

function formatDate(value: string | null): string {
  if (value === null) return "non disponibile";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "non disponibile" : DATE_FORMAT.format(parsed);
}

const SOURCE_STATUS_LABEL: Record<string, string> = {
  VERIFIED: "verificata",
  PENDING_VERIFICATION: "in attesa di verifica",
  STALE: "da verificare",
  UNAVAILABLE: "non disponibile",
};

const STATUS_CLASS: Record<ValoraItem["status"], string> = {
  LIVE: "border-petrol/40 text-petrol",
  DEMO: "border-gold text-gold-foreground bg-gold/10",
  STALE: "border-border text-muted-foreground",
  UNAVAILABLE: "border-destructive/40 text-destructive",
  PLANNED: "border-border text-muted-foreground",
};

function ModuleCard({ item }: { readonly item: ValoraItem }) {
  const source = getSource(item.sourceId);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-serif text-xl">{item.title}</h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[item.status]}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      <p className="mt-2 flex-1 break-words text-sm text-muted-foreground">{item.description}</p>
      <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-2">
          <dt>Categoria:</dt>
          <dd className="min-w-0">{CATEGORY_LABEL[item.category]}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Fonte primaria:</dt>
          <dd className="min-w-0 break-words">{source?.primarySourceName ?? "non disponibile"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Versione:</dt>
          <dd className="min-w-0">{item.version ?? "non dichiarata"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Ultima verifica:</dt>
          <dd className="min-w-0">{formatDate(item.lastVerifiedAt)}</dd>
        </div>
      </dl>
    </>
  );

  return (
    <li className="min-w-0">
      {item.route === null ? (
        <div className="flex h-full flex-col rounded-lg border border-rule bg-card p-5">
          {body}
          <p className="mt-3 text-sm text-muted-foreground">Modulo non ancora disponibile.</p>
        </div>
      ) : (
        <Link
          to={item.route}
          className="group flex h-full flex-col rounded-lg border border-rule bg-card p-5 transition-colors hover:border-petrol focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {body}
          <span className="mt-3 inline-flex items-center gap-1 text-sm text-petrol">
            Apri il modulo
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </span>
        </Link>
      )}
    </li>
  );
}

function ValoraDashboard() {
  const rawSearch = Route.useSearch();
  const search = {
    q: rawSearch.q ?? "",
    categoria: rawSearch.categoria ?? "all",
    stato: rawSearch.stato ?? "all",
  };
  const navigate = Route.useNavigate();

  const items = useMemo(
    () =>
      filterItems(valoraCatalog.items, {
        query: search.q,
        category: search.categoria,
        status: search.stato,
      }),
    [search.q, search.categoria, search.stato],
  );
  const report = useMemo(() => inspectCatalog(), []);
  const sources = useMemo(() => sourceStatusViews(), []);
  const staleSources = sources.filter((source) => source.health !== "OK");

  const update = (patch: Partial<typeof search>) => {
    const next = { ...search, ...patch };
    void navigate({
      to: ".",
      search: {
        ...(next.q === "" ? {} : { q: next.q }),
        ...(next.categoria === "all" ? {} : { categoria: next.categoria }),
        ...(next.stato === "all" ? {} : { stato: next.stato }),
      },
    });
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool</p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Valora Suite</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Moduli di calcolo per costo del capitale, premi per il rischio e valutazione d&apos;impresa.
        Ogni voce dichiara fonte, versione e data di ultima verifica: dove la verifica manca, il
        dato non alimenta alcun calcolo.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 font-medium">DEMO</span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Catalogo {VALORA_CATALOG_VERSION}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Generato il {formatDate(valoraCatalog.generatedAt)}
        </span>
      </div>

      {staleSources.length > 0 ? (
        <p
          role="status"
          className="mt-6 flex items-start gap-2 rounded-lg border border-gold bg-gold/10 p-4 text-sm"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-gold-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0">
            Servizio in modalità ridotta: {staleSources.length} fonte/i senza verifica registrata. I
            moduli collegati restano consultabili con dati dimostrativi.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="ricerca-moduli" className="mt-10">
        <h2 id="ricerca-moduli" className="font-serif text-2xl">
          Moduli
        </h2>

        <form
          className="mt-4 grid gap-4 rounded-lg border border-rule bg-card p-4 sm:grid-cols-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="min-w-0">
            <label className="block text-sm font-medium" htmlFor="valora-q">
              Ricerca
            </label>
            <input
              id="valora-q"
              type="search"
              value={search.q}
              placeholder="WACC, beta, spread…"
              onChange={(event) => update({ q: event.target.value })}
              className="mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium" htmlFor="valora-categoria">
              Categoria
            </label>
            <select
              id="valora-categoria"
              value={search.categoria}
              onChange={(event) => update({ categoria: event.target.value })}
              className="mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tutte le categorie</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium" htmlFor="valora-stato">
              Stato
            </label>
            <select
              id="valora-stato"
              value={search.stato}
              onChange={(event) => update({ stato: event.target.value })}
              className="mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tutti gli stati</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </form>

        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {items.length === 0
            ? "Nessun modulo corrisponde ai criteri selezionati."
            : `${items.length} moduli su ${valoraCatalog.items.length}.`}
        </p>

        {items.length === 0 ? (
          <div className="mt-4 rounded-lg border border-rule bg-muted/40 p-6 text-sm text-muted-foreground">
            <p>Prova a rimuovere un filtro oppure a cercare un termine più generico.</p>
            <button
              type="button"
              onClick={() => update({ q: "", categoria: "all", stato: "all" })}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-petrol focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Azzera i filtri
            </button>
          </div>
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2">
            {items.map((item) => (
              <ModuleCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="stato-fonti" className="mt-14">
        <h2 id="stato-fonti" className="font-serif text-2xl">
          Stato fonti
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sono ammesse esclusivamente fonti primarie e istituzionali, citate con URL canonico:
          nessuna acquisizione automatica è attiva e il browser non contatta mai un servizio
          esterno.
        </p>
        <ul className="mt-5 space-y-4">
          {sources.map((source) => (
            <li key={source.sourceId} className="min-w-0 rounded-lg border border-rule bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-serif text-lg">
                  {source.primarySourceName}
                </h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                    source.health === "OK"
                      ? "border-petrol/40 text-petrol"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {SOURCE_STATUS_LABEL[source.status] ?? "non disponibile"}
                </span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                Fonte primaria
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{source.note}</p>
              <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="flex flex-wrap gap-x-2">
                  <dt>Ultima verifica:</dt>
                  <dd>{formatDate(source.lastVerifiedAt)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt>Data o versione:</dt>
                  <dd>{source.sourceDateOrVersion ?? "non disponibile"}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2 sm:col-span-2">
                  <dt>Uso consentito:</dt>
                  <dd className="min-w-0 break-words">{source.permittedUse}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2 sm:col-span-2">
                  <dt>Limiti d&apos;uso:</dt>
                  <dd className="min-w-0 break-words">{source.limitations}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">{source.professionalNotice}</p>
              <a
                href={source.canonicalUrl}
                target="_blank"
                rel="noreferrer noopener external"
                className="mt-3 inline-flex items-center gap-1 break-all text-sm text-petrol underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                URL canonico della fonte primaria
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ultima-verifica" className="mt-14">
        <h2 id="ultima-verifica" className="font-serif text-2xl">
          Ultima verifica
        </h2>
        <div className="mt-4 rounded-lg border border-rule bg-card p-4">
          <p className="flex items-start gap-2 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-petrol" aria-hidden="true" />
            <span className="min-w-0">
              Controllo dei metadati del {formatDate(report.checkedAt)}: {report.itemsChecked}{" "}
              moduli e {report.sourcesChecked} fonti esaminati, {report.errors} errori e{" "}
              {report.warnings} segnalazioni. L&apos;ispettore non pubblica e non modifica nulla.
            </span>
          </p>
          {report.findings.length > 0 ? (
            <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
              {report.findings.map((finding, index) => (
                <li key={`${finding.code}-${finding.subjectId}-${index}`} className="min-w-0">
                  <span className="mr-2 rounded-full border border-border px-2 py-0.5">
                    {finding.severity}
                  </span>
                  <span className="break-words">{finding.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">Nessuna segnalazione aperta.</p>
          )}
        </div>
      </section>

      <p className="mt-14 rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground">
        Tutti i valori numerici presenti nei moduli Valora sono sintetici e hanno finalità
        dimostrativa: non provengono da alcuna fonte esterna e non costituiscono consulenza fiscale
        o finanziaria. Le sole provenienze esposte sono fonti primarie e istituzionali, citate con
        URL canonico, data o versione e limiti d&apos;uso.
      </p>
    </div>
  );
}
