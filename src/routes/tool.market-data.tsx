import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CountryRiskPanel, FxTable, RatesTable } from "@/components/tools/market-data/tables";
import { formatNumber } from "@/components/tools/market-data/format";
import { DataStatusBadge } from "@/components/tools/market-data/status";
import { useMarketData } from "@/components/tools/market-data/use-market-data";
import { resolveFxPair } from "@/lib/market-data/fx";
import { FX_CURRENCIES, RATE_METRICS } from "@/lib/market-data/registry";
import { todayIso } from "@/lib/market-data/as-of";

const TITLE = "Dati di mercato — cambi, tassi e country risk";
const DESCRIPTION =
  "Cambi di riferimento BCE, tassi Euribor e Treasury, spread creditizi e country risk premium, con fonte, data di riferimento e stato del dato.";

export const Route = createFileRoute("/tool/market-data")({
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
  component: MarketDataPage,
});

const ECB_RATE_IDS = RATE_METRICS.filter((metric) => metric.source === "ECB").map((m) => m.id);
const TREASURY_RATE_IDS = RATE_METRICS.filter((metric) => metric.source === "TREASURY").map(
  (m) => m.id,
);
const FRED_RATE_IDS = RATE_METRICS.filter((metric) => metric.source === "FRED").map((m) => m.id);

function MarketDataPage() {
  const [date, setDate] = useState(todayIso());
  const [pendingDate, setPendingDate] = useState(date);
  const [crossFrom, setCrossFrom] = useState("USD");
  const [crossTo, setCrossTo] = useState("GBP");
  const market = useMarketData(date);
  const bundle = market.bundle;

  const cross = useMemo(
    () => (bundle === null ? null : resolveFxPair(bundle.fx, crossFrom, crossTo)),
    [bundle, crossFrom, crossTo],
  );

  const loading = bundle === null && market.phase !== "error";

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool</p>
      <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">Dati di mercato</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Cambi di riferimento, tassi e premi per il rischio paese presi dalle fonti pubbliche e
        risolti alla data che serve. Ogni valore porta la serie, la data dell&apos;osservazione e il
        modo in cui è stato ottenuto; quando una fonte non risponde il dato resta dichiarato come
        mancante.
      </p>

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-rule bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setDate(pendingDate);
        }}
      >
        <div>
          <label htmlFor="asOfDate" className="text-sm font-medium">
            Data di riferimento
          </label>
          <input
            id="asOfDate"
            type="date"
            value={pendingDate}
            max={todayIso()}
            onChange={(event) => setPendingDate(event.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Applica
        </button>
        <button
          type="button"
          onClick={market.refresh}
          disabled={market.refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${market.refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          {market.refreshing ? "Interrogo le fonti" : "Interroga le fonti"}
        </button>

        <p className="ml-auto max-w-xs text-xs text-muted-foreground" aria-live="polite">
          {market.phase === "error" && `Dati non caricati: ${market.error ?? "errore"}.`}
          {market.phase === "loading" && "Caricamento del dataset…"}
          {bundle !== null && (
            <>
              {bundle.counts.live} dal vivo · {bundle.counts.cached} dal dataset ·{" "}
              {bundle.counts.unavailable} non disponibili
              <span className="mt-0.5 block">
                dataset {bundle.dataset.version} · snapshot {bundle.dataset.snapshotDate}
              </span>
            </>
          )}
        </p>
      </form>

      {bundle !== null && bundle.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-gold bg-gold/10 p-4 text-sm">
          {bundle.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <section aria-labelledby="cambi" className="mt-10">
        <h2 id="cambi" className="font-serif text-2xl">
          Cambi di riferimento BCE
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Le serie della BCE sono tutte contro euro. Una coppia fra due valute terze si ottiene dal
          rapporto fra le due gambe della stessa data: il calcolo è mostrato per intero.
        </p>

        <div className="mt-4 rounded-lg border border-rule bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="crossFrom" className="text-sm font-medium">
                Da
              </label>
              <select
                id="crossFrom"
                value={crossFrom}
                onChange={(event) => setCrossFrom(event.target.value)}
                className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {FX_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="crossTo" className="text-sm font-medium">
                A
              </label>
              <select
                id="crossTo"
                value={crossTo}
                onChange={(event) => setCrossTo(event.target.value)}
                className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {FX_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-48">
              <p className="text-sm font-medium">
                {crossFrom}/{crossTo}
              </p>
              <p className="mt-1 font-serif text-2xl tabular-nums">
                {cross === null
                  ? "—"
                  : cross.status === "OK"
                    ? formatNumber(cross.value, 4, 6)
                    : "non disponibile"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {cross === null && "Caricamento dei cambi…"}
            {cross?.status === "UNAVAILABLE" && cross.reason}
            {cross?.status === "OK" &&
              cross.method === "IDENTITY" &&
              "Stessa valuta: cambio unitario."}
            {cross?.status === "OK" && cross.method === "DIRECT" && (
              <>
                Serie diretta BCE, osservazione del {cross.asOf}.{" "}
                <DataStatusBadge status={cross.cacheStatus} />
              </>
            )}
            {cross?.status === "OK" && cross.method === "INVERSE" && (
              <>
                Reciproco della serie EUR/{crossFrom} del {cross.asOf}.{" "}
                <DataStatusBadge status={cross.cacheStatus} />
              </>
            )}
            {cross?.status === "OK" && cross.method === "CROSS" && (
              <>
                Cross: EUR/{crossTo} ÷ EUR/{crossFrom}, osservazioni del {cross.asOf}.{" "}
                <DataStatusBadge status={cross.cacheStatus} />
                {cross.asOfMismatch && " Le due gambe hanno date diverse: verificare."}
              </>
            )}
          </p>
        </div>

        <div className="mt-4">
          <FxTable fx={bundle?.fx ?? null} loading={loading} />
        </div>
      </section>

      <section aria-labelledby="tassi-bce" className="mt-12">
        <h2 id="tassi-bce" className="font-serif text-2xl">
          Tassi dell&apos;area euro
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Medie Euribor e tassi bancari sulle nuove operazioni verso imprese, dalle statistiche BCE.
          Le medie di periodo diventano disponibili solo a periodo chiuso: la media di un mese non
          esiste prima della sua fine.
        </p>
        <div className="mt-4">
          <RatesTable rates={bundle?.rates ?? null} ids={ECB_RATE_IDS} loading={loading} />
        </div>
      </section>

      <section aria-labelledby="tassi-usa" className="mt-12">
        <h2 id="tassi-usa" className="font-serif text-2xl">
          Tassi statunitensi e spread creditizi
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Curva a scadenza costante dal feed XML ufficiale del Dipartimento del Tesoro: fonte
          primaria, senza chiavi API, pubblicata ogni giorno lavorativo con tutte le scadenze sulla
          stessa riga.
        </p>
        <div className="mt-4">
          <RatesTable rates={bundle?.rates ?? null} ids={TREASURY_RATE_IDS} loading={loading} />
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
          Serie della Federal Reserve Bank of St. Louis: tassi overnight e option-adjusted spread
          degli indici ICE BofA.
        </p>
        <div className="mt-4">
          <RatesTable rates={bundle?.rates ?? null} ids={FRED_RATE_IDS} loading={loading} />
        </div>
      </section>

      <section aria-labelledby="country" className="mt-12">
        <h2 id="country" className="font-serif text-2xl">
          Country risk premium
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Premio per il rischio paese e default spread dal dataset annuale di Aswath Damodaran.
        </p>
        <div className="mt-4 max-w-md">
          <CountryRiskPanel entry={bundle?.country ?? null} />
        </div>
      </section>

      <div className="mt-14 space-y-3 rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground">
        <p>
          Le fonti vengono interrogate dal server, mai dal browser. Ogni valore è l&apos;ultima
          osservazione della serie non successiva alla data di riferimento. Se una chiave non
          risponde, la metrica compare come non disponibile con il motivo: nessun percorso produce
          un valore stimato o una scadenza diversa da quella richiesta.
        </p>
        <p>
          Lo strumento ha finalità tecnico-funzionali e di supporto all&apos;analisi: non
          costituisce consulenza legale o fiscale. I valori vanno verificati alla fonte prima
          dell&apos;uso in documentazione o in contraddittorio.
        </p>
      </div>
    </div>
  );
}
