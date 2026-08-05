import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPatent } from "@/lib/portal.functions";

const DATE = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeZone: "Europe/Rome",
});

function formatDate(value: string) {
  return DATE.format(new Date(`${value}T00:00:00Z`));
}

function detailQuery(id: string) {
  return queryOptions({
    queryKey: ["patents", "detail", id],
    queryFn: () => getPatent({ data: { id } }),
  });
}

export const Route = createFileRoute("/tool/patentscope/$id")({
  head: () => ({
    meta: [
      { title: "Scheda brevetto — Osservatorio Transfer Pricing" },
      {
        name: "description",
        content:
          "Scheda di dettaglio di un brevetto dell'indice interno, con titolari, giurisdizioni e note di rilevanza per il transfer pricing.",
      },
      { property: "og:title", content: "Scheda brevetto" },
      {
        property: "og:description",
        content: "Dettaglio brevetto e note di rilevanza per il transfer pricing.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(detailQuery(params.id));
  },
  component: PatentDetail,
  pendingComponent: () => (
    <p className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">
      Caricamento della scheda in corso…
    </p>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16" role="alert">
      <h1 className="font-serif text-2xl">Scheda non disponibile</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Non è stato possibile caricare la scheda. Riprova tra qualche istante.
      </p>
    </div>
  ),
});

function PatentDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(id));
  const record = data.record;

  if (!record) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-serif text-2xl">Brevetto non trovato</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Il documento richiesto non è presente nell'indice pubblicato.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-6">
          <Link to="/tool/patentscope">Torna alla ricerca</Link>
        </Button>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/tool/patentscope">
          <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
          Torna alla ricerca
        </Link>
      </Button>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-0.5 font-medium">
          {record.publicationNumber}
        </span>
        <span>{record.technologyArea}</span>
        <span className="rounded border border-dashed px-2 py-0.5">DEMO</span>
      </div>

      <h1 className="mt-3 font-serif text-3xl">{record.title}</h1>
      <p className="mt-4 text-muted-foreground">{record.abstract}</p>

      <dl className="mt-8 grid gap-4 rounded-lg border bg-card p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Titolari</dt>
          <dd className="mt-1">{record.applicants.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Inventori</dt>
          <dd className="mt-1">{record.inventors.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Deposito</dt>
          <dd className="mt-1">{formatDate(record.filingDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Pubblicazione</dt>
          <dd className="mt-1">{formatDate(record.publicationDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Giurisdizioni</dt>
          <dd className="mt-1">{record.jurisdictions.join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Classificazione IPC</dt>
          <dd className="mt-1">{record.ipcCodes.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Ampiezza famiglia</dt>
          <dd className="mt-1">{record.familySize} documenti</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Ultima verifica</dt>
          <dd className="mt-1">{formatDate(record.lastVerifiedAt)}</dd>
        </div>
      </dl>

      <section aria-labelledby="rilevanza-tp" className="mt-8 rounded-lg border bg-card p-5">
        <h2 id="rilevanza-tp" className="font-serif text-lg">
          Rilevanza per il transfer pricing
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{record.tpRelevance}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Leggi il dato insieme all'analisi funzionale DEMPE: sviluppo, valorizzazione,
          manutenzione, protezione e sfruttamento dell'intangibile devono essere remunerati
          dove sono effettivamente svolti.
        </p>
      </section>

      {data.related.length > 0 ? (
        <section aria-labelledby="correlati" className="mt-8">
          <h2 id="correlati" className="font-serif text-lg">
            Documenti correlati
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.related.map((item) => (
              <li key={item.id}>
                <Link
                  to="/tool/patentscope/$id"
                  params={{ id: item.id }}
                  className="underline-offset-4 hover:underline"
                >
                  {item.publicationNumber} — {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
        Fonte del dato normalizzato: {record.sourceName}. L'acquisizione avviene solo lato
        server, con allowlist dei domini, timeout e revisione editoriale prima della
        pubblicazione. In questa fase i valori sono sintetici e marcati DEMO.
      </p>
    </article>
  );
}