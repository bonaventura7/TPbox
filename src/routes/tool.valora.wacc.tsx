/**
 * Valora Suite — calcolatore WACC.
 * Tutti i parametri sono inseriti manualmente dall'utente: nessun fetch,
 * nessun dato di mercato precompilato, nessuna persistenza.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { useState } from "react";

import { getItem } from "../lib/valora/catalog";
import { WaccForm } from "../components/valora/wacc-form";
import { WaccResult } from "../components/valora/wacc-result";
import type { WaccOutcome } from "../lib/valora/wacc/model";

const TITLE = "Calcolatore WACC — costo medio ponderato del capitale | Valora Suite";
const DESCRIPTION =
  "Calcolatore WACC manuale: inserisci tasso privo di rischio, premi per il rischio, beta unlevered, spread creditizio, aliquota e struttura finanziaria e ottieni Ke, Kd e WACC con tutti i passaggi.";

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
  const [outcome, setOutcome] = useState<WaccOutcome | null>(null);

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
          Calcolatore operativo
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Inserimento manuale
        </span>
      </div>

      <p className="mt-5 flex items-start gap-2 rounded-lg border border-rule bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-petrol" aria-hidden="true" />
        <span className="min-w-0">
          I dati sono inseriti manualmente dall&apos;utente. Il tool non recupera dati da fonti
          esterne: non esistono valori di mercato precompilati, non viene salvato nulla e il
          risultato compare soltanto dopo un calcolo valido.
        </span>
      </p>

      <section aria-labelledby="calcolatore" className="mt-10">
        <h2 id="calcolatore" className="font-serif text-2xl">
          Parametri di calcolo
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Percentuali in punti percentuali (ad esempio 3,5), beta come indice (ad esempio 0,9),
          debito ed equity nella stessa unità monetaria: il calcolatore non effettua conversioni.
        </p>
        <WaccForm onResult={setOutcome} />
      </section>

      <section aria-labelledby="risultato" className="mt-12">
        <h2 id="risultato" className="font-serif text-2xl">
          Risultato e tracciabilità
        </h2>
        <div aria-live="polite">
          {outcome === null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nessun risultato disponibile: compila i parametri e seleziona «Calcola WACC».
            </p>
          ) : (
            <WaccResult outcome={outcome} />
          )}
        </div>
      </section>

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
    </div>
  );
}
