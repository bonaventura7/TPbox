import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Trash2 } from "lucide-react";

import { RangeShift } from "@/components/tools/currency-benchmark/range-shift";
import { DataStatusBadge } from "@/components/tools/market-data/status";
import { useMarketData } from "@/components/tools/market-data/use-market-data";
import { formatNumber } from "@/components/tools/market-data/format";
import { todayIso } from "@/lib/market-data/as-of";
import { resolveFxPair } from "@/lib/market-data/fx";
import {
  REFERENCE_BASIS_NOTE,
  REFERENCE_RATES,
  TENORS,
  type TenorId,
} from "@/lib/market-data/registry";
import { buildDifferential } from "@/lib/currency-benchmark/differential";
import {
  convert,
  ENGINE_VERSION,
  formatBp,
  formatPercent,
  formatSignedBp,
  METHOD_LABELS,
  METRIC_TYPE_LABELS,
  rangeStats,
  toCsv,
  toPercent,
} from "@/lib/currency-benchmark/engine";
import { parseDecimal, parsePastedRows } from "@/lib/currency-benchmark/parse";
import type {
  ConversionSettings,
  MethodId,
  MetricType,
  MetricUnit,
  Observation,
} from "@/lib/currency-benchmark/types";

const TITLE = "Currency-Adjusted Benchmark — conversione di valuta del range";
const DESCRIPTION =
  "Converte le osservazioni di un benchmark nella valuta di destinazione e ricalcola il range interquartile, con il differenziale dei tassi di riferimento preso da fonti pubbliche e la provenienza di ogni dato.";

export const Route = createFileRoute("/tool/currency-benchmark")({
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
  component: CurrencyBenchmarkPage,
});

const CURRENCIES: readonly string[] = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
  "CNY",
  "HKD",
  "SEK",
  "NOK",
  "PLN",
  "MXN",
  "DKK",
  "CZK",
  "HUF",
  "RON",
  "SGD",
  "NZD",
  "BRL",
  "INR",
  "ZAR",
  "TRY",
  "AED",
];

const METRIC_TYPES: readonly MetricType[] = [
  "yield",
  "coupon",
  "lending_rate",
  "credit_spread",
  "xccy_basis",
  "other",
];

const SAMPLE = "IQT245862223\t7,878\nIQT263552785\t7,697\nIQT298114560\t8,015";

const FIELD =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL = "text-sm font-medium";

function CurrencyBenchmarkPage() {
  const [sourceCurrency, setSourceCurrency] = useState("EUR");
  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [tenor, setTenor] = useState<TenorId>("5Y");
  const [metricUnit, setMetricUnit] = useState<MetricUnit>("percent");
  const [metricType, setMetricType] = useState<MetricType>("yield");
  const [method, setMethod] = useState<MethodId>("RATE_DIFFERENTIAL");
  const [manualBasis, setManualBasis] = useState("0");
  const [date, setDate] = useState(todayIso());
  const [paste, setPaste] = useState("");
  const [rows, setRows] = useState<readonly Observation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const market = useMarketData(date);
  const bundle = market.bundle;

  const differentialOutcome = useMemo(
    () =>
      bundle === null ? null : buildDifferential(bundle, sourceCurrency, targetCurrency, tenor),
    [bundle, sourceCurrency, targetCurrency, tenor],
  );

  const fx = useMemo(
    () => (bundle === null ? null : resolveFxPair(bundle.fx, sourceCurrency, targetCurrency)),
    [bundle, sourceCurrency, targetCurrency],
  );

  const settings: ConversionSettings = useMemo(() => {
    const manual = parseDecimal(manualBasis);
    return {
      sourceCurrency,
      targetCurrency,
      tenor,
      metricUnit,
      metricType,
      method,
      manualBasisBp: manual.ok ? manual.value : null,
      differential: differentialOutcome?.ok === true ? differentialOutcome.differential : null,
      differentialBlockedReason:
        differentialOutcome === null
          ? "dati di mercato non ancora caricati"
          : differentialOutcome.ok
            ? null
            : differentialOutcome.reason,
    };
  }, [
    sourceCurrency,
    targetCurrency,
    tenor,
    metricUnit,
    metricType,
    method,
    manualBasis,
    differentialOutcome,
  ]);

  const results = useMemo(
    () => rows.map((observation) => ({ observation, result: convert(observation, settings) })),
    [rows, settings],
  );

  const sourceStats = useMemo(
    () =>
      rangeStats(
        rows
          .map((row) => row.value)
          .filter((value): value is number => value !== null)
          .map((value) => toPercent(value, metricUnit)),
      ),
    [rows, metricUnit],
  );

  const targetStats = useMemo(
    () =>
      rangeStats(
        results
          .map(({ result }) => result.targetPercent)
          .filter((value): value is number => value !== null),
      ),
    [results],
  );

  const unitLabel = metricUnit === "bps" ? "bp" : "%";
  /** Mostra un valore in punti percentuali nell'unita' scelta nel pannello. */
  const showMetric = (percent: number) =>
    metricUnit === "bps" ? formatBp(percent * 100, 1) : formatPercent(percent);

  const valid = results.filter(({ result }) => result.status === "VALID").length;
  const blockedResult = results.find(({ result }) => result.status !== "VALID")?.result ?? null;

  const importRows = useCallback(() => {
    const parsed = parsePastedRows(paste, rows.length);
    if (parsed.rows.length === 0 && parsed.skipped.length === 0) {
      setNotice("Nessuna riga da importare.");
      return;
    }
    setRows((current) => [...current, ...parsed.rows.map((row) => ({ ...row }))]);
    setPaste("");
    setNotice(
      parsed.skipped.length === 0
        ? `${parsed.rows.length} righe importate.`
        : `${parsed.rows.length} righe importate, ${parsed.skipped.length} scartate perché non numeriche o ambigue.`,
    );
  }, [paste, rows.length]);

  const exportCsv = useCallback(() => {
    const csv = toCsv(results, {
      settings,
      datasetVersion: bundle?.dataset.version ?? "n/d",
      requestedDate: date,
      generatedAt: new Date().toISOString(),
    });
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `currency-adjusted-benchmark-${date}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [results, settings, bundle, date]);

  const differentialCoverage = Object.entries(REFERENCE_RATES).map(([currency, tenors]) => ({
    currency,
    tenors: Object.keys(tenors).join(", "),
  }));

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool</p>
      <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">
        Currency-Adjusted Benchmark
      </h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Un benchmark costruito su comparabili in una valuta non è direttamente utilizzabile per una
        transazione in un&apos;altra. Lo strumento converte ogni osservazione e ricalcola il range
        interquartile nella valuta di destinazione, dichiarando su quale base la conversione è
        avvenuta.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Motore {ENGINE_VERSION}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Dati {bundle?.dataset.version ?? "in caricamento"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Percentili con interpolazione lineare
        </span>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[19rem_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section
            aria-labelledby="parametri"
            className="rounded-lg border border-rule bg-card p-5"
          >
            <h2 id="parametri" className="font-serif text-xl">
              Parametri
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sourceCurrency" className={LABEL}>
                  Da valuta
                </label>
                <select
                  id="sourceCurrency"
                  className={FIELD}
                  value={sourceCurrency}
                  onChange={(event) => setSourceCurrency(event.target.value)}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="targetCurrency" className={LABEL}>
                  A valuta
                </label>
                <select
                  id="targetCurrency"
                  className={FIELD}
                  value={targetCurrency}
                  onChange={(event) => setTargetCurrency(event.target.value)}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tenor" className={LABEL}>
                  Tenor
                </label>
                <select
                  id="tenor"
                  className={FIELD}
                  value={tenor}
                  onChange={(event) => setTenor(event.target.value as TenorId)}
                >
                  {TENORS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="metricUnit" className={LABEL}>
                  Unità
                </label>
                <select
                  id="metricUnit"
                  className={FIELD}
                  value={metricUnit}
                  onChange={(event) => setMetricUnit(event.target.value as MetricUnit)}
                >
                  <option value="percent">Percentuale</option>
                  <option value="bps">Basis point</option>
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="metricType" className={LABEL}>
                Tipo di metrica
              </label>
              <select
                id="metricType"
                className={FIELD}
                value={metricType}
                onChange={(event) => setMetricType(event.target.value as MetricType)}
              >
                {METRIC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {METRIC_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="mt-4">
              <legend className={LABEL}>Metodo di conversione</legend>
              <div className="mt-2 space-y-2">
                {(["RATE_DIFFERENTIAL", "MANUAL_ADJUSTMENT"] as const).map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer gap-2 rounded-md border border-border p-3 text-sm transition-colors duration-150 has-[:checked]:border-petrol has-[:checked]:bg-accent/40"
                  >
                    <input
                      type="radio"
                      name="method"
                      value={option}
                      checked={method === option}
                      onChange={() => setMethod(option)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium">{METHOD_LABELS[option]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {option === "RATE_DIFFERENTIAL"
                          ? "Differenza fra i rendimenti governativi delle due valute alla stessa scadenza."
                          : "Scostamento in basis point deciso e documentato dall'analista."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {method === "MANUAL_ADJUSTMENT" && (
              <div className="mt-3">
                <label htmlFor="manualBasis" className={LABEL}>
                  Aggiustamento (bp)
                </label>
                <input
                  id="manualBasis"
                  inputMode="decimal"
                  className={FIELD}
                  value={manualBasis}
                  onChange={(event) => setManualBasis(event.target.value)}
                />
              </div>
            )}

            <div className="mt-3">
              <label htmlFor="marketDate" className={LABEL}>
                Data dei dati di mercato
              </label>
              <input
                id="marketDate"
                type="date"
                className={`${FIELD} tabular-nums`}
                value={date}
                max={todayIso()}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </section>

          <section
            aria-labelledby="dati-mercato"
            className="rounded-lg border border-rule bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="dati-mercato" className="font-serif text-xl">
                Dati di mercato
              </h2>
              <button
                type="button"
                onClick={market.refresh}
                disabled={market.refreshing}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${market.refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
                  aria-hidden="true"
                />
                Aggiorna
              </button>
            </div>

            <div aria-live="polite" className="mt-3 text-sm">
              {market.phase === "loading" && (
                <p className="text-muted-foreground">Caricamento del dataset…</p>
              )}
              {market.phase === "error" && (
                <p className="text-destructive">{market.error ?? "dati non disponibili"}</p>
              )}

              {differentialOutcome?.ok === true && (
                <dl className="space-y-2">
                  {[
                    differentialOutcome.differential.sourceLeg,
                    differentialOutcome.differential.targetLeg,
                  ].map((leg) => (
                    <div key={leg.metricId} className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-muted-foreground">
                        {leg.currency} · {leg.asOf}
                        {!leg.verified && <span className="block">serie non verificata</span>}
                      </dt>
                      <dd className="flex items-center gap-2 tabular-nums">
                        {formatPercent(leg.value)}
                        <DataStatusBadge status={leg.cacheStatus} />
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-2">
                    <dt className="font-medium">Differenziale</dt>
                    <dd className="font-serif text-lg tabular-nums">
                      {formatSignedBp(differentialOutcome.differential.deltaBp, 2)}
                    </dd>
                  </div>
                </dl>
              )}

              {differentialOutcome?.ok === false && (
                <div className="rounded-md border border-gold bg-gold/10 p-3 text-xs">
                  <p className="font-medium">Differenziale non disponibile</p>
                  <p className="mt-1">{differentialOutcome.reason}</p>
                  <p className="mt-2 text-muted-foreground">
                    Copertura attuale:{" "}
                    {differentialCoverage
                      .map((row) => `${row.currency} (${row.tenors})`)
                      .join(" · ")}
                    . Per le altre valute serve l&apos;aggiustamento manuale.
                  </p>
                </div>
              )}

              {fx?.status === "OK" && fx.method !== "IDENTITY" && (
                <p className="mt-3 border-t border-rule pt-2 text-xs text-muted-foreground">
                  Cambio {fx.pair}:{" "}
                  <span className="tabular-nums text-foreground">
                    {formatNumber(fx.value, 4, 6)}
                  </span>{" "}
                  ({fx.asOf}) — utile per riesprimere il notional, non usato nella conversione della
                  metrica.
                </p>
              )}
            </div>
          </section>
        </aside>

        <div className="space-y-12">
          <section aria-labelledby="osservazioni">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="osservazioni" className="font-serif text-2xl">
                Osservazioni
              </h2>
              <p className="text-sm text-muted-foreground tabular-nums">
                {rows.length} righe · {valid} convertite
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-rule bg-card p-4">
              <label htmlFor="paste" className={LABEL}>
                Incolla da Excel
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Una o due colonne: identificativo del comparabile e metrica. Con una sola colonna
                l&apos;identificativo viene generato. Virgola o punto decimale, tabulazione o punto
                e virgola come separatore.
              </p>
              <textarea
                id="paste"
                rows={4}
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                placeholder={SAMPLE}
                className={`${FIELD} font-mono text-xs`}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={importRows}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Aggiungi righe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setNotice("Tabella svuotata.");
                  }}
                  disabled={rows.length === 0}
                  className="rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted disabled:opacity-50"
                >
                  Svuota
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={rows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted disabled:opacity-50"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Esporta CSV
                </button>
                {notice !== null && (
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {notice}
                  </span>
                )}
              </div>
            </div>

            {blockedResult?.warning != null && rows.length > 0 && (
              <p className="mt-4 rounded-lg border border-gold bg-gold/10 p-3 text-sm">
                {valid === 0
                  ? "Nessuna riga convertita: "
                  : `${rows.length - valid} righe su ${rows.length} non convertite: `}
                {blockedResult.warning}
              </p>
            )}

            {rows.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-rule p-6 text-sm text-muted-foreground">
                Nessuna osservazione. Incolla le metriche dei comparabili: ogni riga verrà
                convertita con il metodo scelto e il range comparirà sotto, prima e dopo la
                conversione.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Osservazioni del benchmark con il valore convertito, il delta e lo stato
                  </caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th
                        scope="col"
                        className="px-3 py-2 text-left font-medium text-muted-foreground"
                      >
                        Comparable ID
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-muted-foreground"
                      >
                        Origine ({unitLabel})
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-muted-foreground"
                      >
                        Target ({unitLabel})
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium text-muted-foreground"
                      >
                        Delta (bp)
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-left font-medium text-muted-foreground"
                      >
                        Stato
                      </th>
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Azioni</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(({ observation, result }, index) => (
                      <tr key={`${observation.id}-${index}`} className="border-t border-rule">
                        <td className="px-3 py-1.5">
                          <input
                            aria-label={`Identificativo riga ${index + 1}`}
                            value={observation.id}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((row, position) =>
                                  position === index ? { ...row, id: event.target.value } : row,
                                ),
                              )
                            }
                            className="w-36 rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-input focus-visible:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            aria-label={`Metrica riga ${index + 1}`}
                            inputMode="decimal"
                            value={observation.raw}
                            onChange={(event) => {
                              const raw = event.target.value;
                              const parsed = parseDecimal(raw);
                              setRows((current) =>
                                current.map((row, position) =>
                                  position === index
                                    ? { ...row, raw, value: parsed.ok ? parsed.value : null }
                                    : row,
                                ),
                              );
                            }}
                            className="w-24 rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums hover:border-input focus-visible:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                          {result.targetPercent === null ? "—" : showMetric(result.targetPercent)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {result.deltaBp === null ? "—" : formatSignedBp(result.deltaBp, 1)}
                        </td>
                        <td className="px-3 py-1.5">
                          {result.status === "VALID" && (
                            <span className="text-xs text-muted-foreground">convertita</span>
                          )}
                          {result.status === "BLOCKED" && (
                            <span
                              className="text-xs text-muted-foreground"
                              title={result.warning ?? undefined}
                            >
                              bloccata
                            </span>
                          )}
                          {result.status === "ERROR" && (
                            <span className="text-xs">
                              <span className="font-medium">errore</span>
                              <span className="text-muted-foreground">: {result.warning}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            aria-label={`Elimina riga ${index + 1}`}
                            onClick={() =>
                              setRows((current) =>
                                current.filter((_, position) => position !== index),
                              )
                            }
                            className="rounded-sm p-1 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="range">
            <h2 id="range" className="font-serif text-2xl">
              Range statistico
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Calcolato sulla popolazione di partenza e su quella convertita. Le righe bloccate non
              entrano nel range della valuta di destinazione.
            </p>

            {sourceStats === null ? (
              <p className="mt-4 rounded-lg border border-dashed border-rule p-6 text-sm text-muted-foreground">
                Il range comparirà qui: minimo, primo quartile, mediana, terzo quartile e massimo,
                prima e dopo la conversione.
              </p>
            ) : (
              <>
                <RangeShift
                  source={sourceStats}
                  target={targetStats}
                  sourceLabel={sourceCurrency}
                  targetLabel={targetCurrency}
                />

                <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Percentili della popolazione di partenza e di quella convertita
                    </caption>
                    <thead className="bg-muted/50">
                      <tr>
                        <th
                          scope="col"
                          className="px-3 py-2 text-left font-medium text-muted-foreground"
                        >
                          Popolazione
                        </th>
                        {["Minimo", "Q1", "Mediana", "Q3", "Massimo"].map((label) => (
                          <th
                            key={label}
                            scope="col"
                            className="px-3 py-2 text-right font-medium text-muted-foreground"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-rule">
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {sourceCurrency} · {rows.length} osservazioni
                        </th>
                        {[
                          sourceStats.min,
                          sourceStats.q1,
                          sourceStats.median,
                          sourceStats.q3,
                          sourceStats.max,
                        ].map((value, index) => (
                          <td
                            key={index}
                            className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                          >
                            {showMetric(value)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-rule">
                        <th scope="row" className="px-3 py-2 text-left font-medium text-petrol">
                          {targetCurrency} · {valid} convertite
                        </th>
                        {targetStats === null
                          ? Array.from({ length: 5 }, (_, index) => (
                              <td
                                key={index}
                                className="px-3 py-2 text-right text-muted-foreground"
                              >
                                —
                              </td>
                            ))
                          : [
                              targetStats.min,
                              targetStats.q1,
                              targetStats.median,
                              targetStats.q3,
                              targetStats.max,
                            ].map((value, index) => (
                              <td
                                key={index}
                                className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums"
                              >
                                {showMetric(value)}
                              </td>
                            ))}
                      </tr>
                      <tr className="border-t border-rule bg-muted/30">
                        <th scope="row" className="px-3 py-2 text-left text-muted-foreground">
                          Delta (bp)
                        </th>
                        {targetStats === null
                          ? Array.from({ length: 5 }, (_, index) => (
                              <td
                                key={index}
                                className="px-3 py-2 text-right text-muted-foreground"
                              >
                                —
                              </td>
                            ))
                          : (
                              [
                                [targetStats.min, sourceStats.min],
                                [targetStats.q1, sourceStats.q1],
                                [targetStats.median, sourceStats.median],
                                [targetStats.q3, sourceStats.q3],
                                [targetStats.max, sourceStats.max],
                              ] as const
                            ).map(([after, before], index) => (
                              <td
                                key={index}
                                className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground"
                              >
                                {formatSignedBp((after - before) * 100, 1)}
                              </td>
                            ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {targetStats !== null && (
                  <p className="mt-3 text-sm">
                    Intervallo interquartile in {targetCurrency}:{" "}
                    <strong className="tabular-nums">
                      {showMetric(targetStats.q1)} – {showMetric(targetStats.q3)}
                    </strong>{" "}
                    <span className="text-muted-foreground tabular-nums">
                      (ampiezza {formatBp((targetStats.q3 - targetStats.q1) * 100)})
                    </span>
                  </p>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="metodo" className="space-y-3 text-sm">
            <h2 id="metodo" className="font-serif text-2xl">
              Metodo e limiti
            </h2>
            <p className="text-muted-foreground">
              Il differenziale è la differenza fra i tassi di riferimento delle due valute alla
              scadenza scelta: metrica convertita = metrica di partenza + (tasso della valuta di
              destinazione − tasso della valuta di partenza). {REFERENCE_BASIS_NOTE}
            </p>
            <p className="text-muted-foreground">
              Il metodo cattura la differenza fra i livelli dei tassi, non le differenze di rischio
              di credito, di liquidità, di regime fiscale o il cross-currency basis. Per questo non
              si applica a uno spread creditizio né a un basis, dove il differenziale è già
              incorporato nel tasso base della valuta: in quei casi lo strumento blocca la riga e
              resta l&apos;aggiustamento manuale, da documentare separatamente.
            </p>
            <p className="text-muted-foreground">
              Le due gambe possono avere date di riferimento diverse (per esempio una serie
              giornaliera e una media mensile): quando succede la riga riporta l&apos;avviso e la
              tabella mostra entrambe le date. Nessun valore viene stimato: se una serie non
              risponde, la conversione si blocca.
            </p>
            <p className="rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground">
              Strumento di supporto all&apos;analisi: non costituisce consulenza legale o fiscale e
              non garantisce l&apos;esito di una verifica. La scelta del metodo di conversione, la
              sua documentazione e la verifica dei dati alla fonte restano in capo al
              professionista. Nessun dato inserito viene inviato o conservato: le osservazioni
              restano nel browser.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
