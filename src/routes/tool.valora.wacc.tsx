/**
 * Valora Suite — scheda informativa del modulo WACC.
 * Pagina di sola lettura: nessun form, nessun calcolo, nessun valore dimostrativo.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";

import { getItem, getSource } from "../lib/valora/catalog";

const TITLE = "WACC — scheda di catalogo in validazione | Valora Suite";
const DESCRIPTION =
  "Scheda informativa del modulo WACC: perimetro metodologico, fonte primaria, versione e stato di verifica. Il modulo non è operativo e non produce risultati.";

export const Route = createFileRoute("/tool/valora/wacc")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WaccInfoPage,
});

function WaccInfoPage() {
  const item = getItem("valora-wacc");
  const source = item ? getSource(item.sourceId) : null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/tool/valora"
        className="inline-flex items-center gap-1 text-sm text-petrol underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Valora Suite
      </Link>

      <h1 className="mt-3 font-serif text-3xl tracking-tight">
        WACC — costo medio ponderato del capitale
      </h1>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          In validazione
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Modulo non operativo
        </span>
      </div>

      <p className="mt-5 flex items-start gap-2 rounded-lg border border-rule bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-petrol" aria-hidden="true" />
        <span className="min-w-0">
          Questa pagina descrive soltanto il perimetro metodologico del modulo. Non è disponibile
          alcun calcolo, alcun input e alcun risultato: la scheda resta informativa fino al
          completamento della validazione metodologica e documentale.
        </span>
      </p>

      <section aria-labelledby="perimetro" className="mt-10">
        <h2 id="perimetro" className="font-serif text-2xl">
          Perimetro metodologico
        </h2>
        <p className="mt-2 text-muted-foreground">
          {item?.description ??
            "Descrizione non disponibile: la scheda non è presente nel catalogo."}
        </p>
        <ol className="mt-4 space-y-3">
          {(item?.formulaChain ?? []).map((formula, index) => (
            <li key={formula} className="min-w-0 rounded-lg border border-rule bg-card p-4 text-sm">
              <span className="mr-2 text-xs text-muted-foreground">Passaggio {index + 1}</span>
              <span className="break-words">{formula}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Le relazioni sono riportate in forma simbolica a scopo documentale: nessun parametro è
          precompilato e nessun valore viene elaborato.
        </p>
      </section>

      <section aria-labelledby="provenienza" className="mt-12">
        <h2 id="provenienza" className="font-serif text-2xl">
          Provenienza e stato di verifica
        </h2>
        <dl className="mt-4 space-y-2 rounded-lg border border-rule bg-card p-4 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Fonte primaria:</dt>
            <dd className="min-w-0 break-words">
              {source?.primarySourceName ?? "non disponibile"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Data o versione della fonte:</dt>
            <dd className="min-w-0">{source?.sourceDateOrVersion ?? "non disponibile"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Ultima verifica:</dt>
            <dd className="min-w-0">{source?.lastVerifiedAt ?? "non disponibile"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Versione del modulo:</dt>
            <dd className="min-w-0">{item?.version ?? "non dichiarata"}</dd>
          </div>
          {source ? (
            <>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Uso consentito:</dt>
                <dd className="min-w-0 break-words">{source.permittedUse}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Limiti d&apos;uso:</dt>
                <dd className="min-w-0 break-words">{source.limitations}</dd>
              </div>
            </>
          ) : null}
        </dl>
        {source ? (
          <a
            href={source.canonicalUrl}
            target="_blank"
            rel="noreferrer noopener external"
            className="mt-3 inline-flex items-center gap-1 break-all text-sm text-petrol underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            URL canonico della fonte primaria
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        ) : null}
      </section>

      <p className="mt-12 rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground">
        {source?.professionalNotice ??
          "Riferimento informativo: i contenuti non costituiscono consulenza fiscale, finanziaria o di valutazione e vanno verificati da un professionista."}
      </p>
    </div>
  );
}
