/**
 * Calcolatore Interest Rate Swap.
 *
 * Tenuto separato dal Currency-Adjusted Benchmark: quello converte un range di
 * comparabili fra valute, questo costruisce lo scadenzario e gli interessi di
 * uno swap. Sono due domini diversi e condividerne il motore sarebbe un
 * accoppiamento improprio.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Download, Play } from "lucide-react";

import { DAY_COUNTS, DAY_COUNT_LABELS } from "@/lib/swap/daycount";
import { FREQUENCY_LABELS, PAY_FREQUENCIES, maturityFromTenor } from "@/lib/swap/schedule";
import { ENGINE_VERSION, computeSwap, toCsv } from "@/lib/swap/engine";
import type {
  DayCountId,
  LegResult,
  PayFrequencyId,
  SwapInput,
  SwapResult,
} from "@/lib/swap/types";

const TITLE = "Calcolatore Interest Rate Swap — scadenzario e interessi di periodo";
const DESCRIPTION =
  "Costruisce lo scadenzario di un interest rate swap dalle convenzioni di mercato — data dello swap, day count 30/360, pay frequency annuale — e calcola la frazione d'anno e gli interessi di ogni periodo su entrambe le gambe.";

export const Route = createFileRoute("/tool/swap")({
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
  component: SwapCalculatorPage,
});

const FIELD =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL = "text-sm font-medium";

const CURRENCIES: readonly string[] = ["EUR", "USD", "GBP", "CHF", "JPY", "SEK", "NOK", "PLN"];

const TENORS: readonly { readonly months: number; readonly label: string }[] = [
  { months: 12, label: "1 anno" },
  { months: 24, label: "2 anni" },
  { months: 36, label: "3 anni" },
  { months: 60, label: "5 anni" },
  { months: 84, label: "7 anni" },
  { months: 120, label: "10 anni" },
];

/**
 * Stato del calcolo. L'avvio e' esplicito: finche' non si preme il pulsante il
 * risultato non esiste, e mentre il calcolo e' in corso il pulsante non
 * accetta un secondo click.
 */
type CalcState =
  | { readonly phase: "idle" }
  | { readonly phase: "calculating" }
  | { readonly phase: "result"; readonly result: SwapResult }
  | { readonly phase: "error"; readonly reason: string };

const AMOUNT = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const FRACTION = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

function SwapCalculatorPage() {
  const [effectiveDate, setEffectiveDate] = useState("");
  const [maturityMode, setMaturityMode] = useState<"tenor" | "date">("tenor");
  const [tenorMonths, setTenorMonths] = useState(60);
  const [maturityDate, setMaturityDate] = useState("");
  const [notional, setNotional] = useState("10000000");
  const [currency, setCurrency] = useState("EUR");
  const [fixedRate, setFixedRate] = useState("3,25".replace(",", "."));
  const [fixedDayCount, setFixedDayCount] = useState<DayCountId>("30/360");
  const [fixedFrequency, setFixedFrequency] = useState<PayFrequencyId>("ANNUAL");
  const [withFloating, setWithFloating] = useState(false);
  const [floatingRate, setFloatingRate] = useState("2.90");
  const [floatingDayCount, setFloatingDayCount] = useState<DayCountId>("ACT/360");
  const [floatingFrequency, setFloatingFrequency] = useState<PayFrequencyId>("SEMI_ANNUAL");
  const [state, setState] = useState<CalcState>({ phase: "idle" });

  /** Scadenza effettiva: dal tenor o dalla data inserita a mano. */
  const resolvedMaturity = useMemo(
    () =>
      maturityMode === "tenor"
        ? (maturityFromTenor(effectiveDate, tenorMonths) ?? "")
        : maturityDate,
    [maturityMode, effectiveDate, tenorMonths, maturityDate],
  );

  /** Il primo motivo per cui il calcolo non puo' partire, o null se puo'. */
  const formError = useMemo(() => {
    if (effectiveDate === "") return "Inserisci la data dello swap.";
    if (resolvedMaturity === "") return "Indica la scadenza.";
    if (resolvedMaturity <= effectiveDate)
      return "La scadenza deve essere successiva alla data dello swap.";
    const amount = Number(notional);
    if (!Number.isFinite(amount) || amount <= 0) return "Il nozionale deve essere positivo.";
    if (!Number.isFinite(Number(fixedRate)) || fixedRate.trim() === "")
      return "Il tasso fisso deve essere un numero.";
    if (withFloating && (!Number.isFinite(Number(floatingRate)) || floatingRate.trim() === ""))
      return "Il tasso variabile deve essere un numero.";
    return null;
  }, [effectiveDate, resolvedMaturity, notional, fixedRate, withFloating, floatingRate]);

  const input: SwapInput = useMemo(
    () => ({
      effectiveDate,
      maturityDate: resolvedMaturity,
      notional: Number(notional),
      currency,
      fixedRatePercent: Number(fixedRate),
      floatingRatePercent: withFloating ? Number(floatingRate) : null,
      fixedDayCount,
      fixedFrequency,
      floatingDayCount,
      floatingFrequency,
    }),
    [
      effectiveDate,
      resolvedMaturity,
      notional,
      currency,
      fixedRate,
      withFloating,
      floatingRate,
      fixedDayCount,
      fixedFrequency,
      floatingDayCount,
      floatingFrequency,
    ],
  );

  const running = state.phase === "calculating";
  const disabled = formError !== null || running;

  const start = useCallback(() => {
    if (formError !== null || running) return;
    setState({ phase: "calculating" });
    // Il calcolo e' istantaneo: il rinvio serve solo a far comparire lo stato
    // di attesa e a chiudere la finestra del doppio invio.
    window.setTimeout(() => {
      const outcome = computeSwap(input);
      setState(
        outcome.ok
          ? { phase: "result", result: outcome.result }
          : { phase: "error", reason: outcome.reason },
      );
    }, 0);
  }, [formError, running, input]);

  const exportCsv = useCallback(() => {
    if (state.phase !== "result") return;
    const legs: LegResult[] = [state.result.fixedLeg];
    if (state.result.floatingLeg !== null) legs.push(state.result.floatingLeg);
    const csv = toCsv(state.result.input, legs);
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `swap-${state.result.input.effectiveDate}-${state.result.input.maturityDate}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [state]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool</p>
      <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">
        Calcolatore Interest Rate Swap
      </h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Costruisce lo scadenzario dei pagamenti dalle convenzioni di mercato e calcola la frazione
        d&apos;anno e gli interessi di ogni periodo sulle due gambe. Le date si generano
        all&apos;indietro dalla scadenza, con il periodo irregolare in testa.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Motore {ENGINE_VERSION}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          ISDA 2006 Definitions §4.16
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Nessuna curva di sconto
        </span>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[21rem_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section
            aria-labelledby="parametri"
            className="rounded-lg border border-rule bg-card p-5"
          >
            <h2 id="parametri" className="font-serif text-xl">
              Parametri
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="effectiveDate" className={LABEL}>
                  Swap date <span className="text-destructive">*</span>
                </label>
                <input
                  id="effectiveDate"
                  type="date"
                  required
                  className={FIELD}
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Data di decorrenza: primo periodo di maturazione.
                </p>
              </div>

              <div>
                <label htmlFor="maturityMode" className={LABEL}>
                  Scadenza definita da
                </label>
                <select
                  id="maturityMode"
                  className={FIELD}
                  value={maturityMode}
                  onChange={(event) => setMaturityMode(event.target.value as "tenor" | "date")}
                >
                  <option value="tenor">Durata</option>
                  <option value="date">Data</option>
                </select>
              </div>

              {maturityMode === "tenor" ? (
                <div>
                  <label htmlFor="tenor" className={LABEL}>
                    Durata
                  </label>
                  <select
                    id="tenor"
                    className={FIELD}
                    value={tenorMonths}
                    onChange={(event) => setTenorMonths(Number(event.target.value))}
                  >
                    {TENORS.map((tenor) => (
                      <option key={tenor.months} value={tenor.months}>
                        {tenor.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Scadenza: {resolvedMaturity === "" ? "—" : resolvedMaturity}
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor="maturityDate" className={LABEL}>
                    Data di scadenza
                  </label>
                  <input
                    id="maturityDate"
                    type="date"
                    className={FIELD}
                    value={maturityDate}
                    onChange={(event) => setMaturityDate(event.target.value)}
                  />
                </div>
              )}

              <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                <div>
                  <label htmlFor="notional" className={LABEL}>
                    Nozionale
                  </label>
                  <input
                    id="notional"
                    type="number"
                    min="0"
                    step="1000"
                    className={FIELD}
                    value={notional}
                    onChange={(event) => setNotional(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="currency" className={LABEL}>
                    Valuta
                  </label>
                  <select
                    id="currency"
                    className={FIELD}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="gamba-fissa"
            className="rounded-lg border border-rule bg-card p-5"
          >
            <h2 id="gamba-fissa" className="font-serif text-xl">
              Gamba fissa
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="fixedRate" className={LABEL}>
                  Tasso fisso (%)
                </label>
                <input
                  id="fixedRate"
                  type="number"
                  step="0.01"
                  className={FIELD}
                  value={fixedRate}
                  onChange={(event) => setFixedRate(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="fixedDayCount" className={LABEL}>
                  Day count
                </label>
                <select
                  id="fixedDayCount"
                  className={FIELD}
                  value={fixedDayCount}
                  onChange={(event) => setFixedDayCount(event.target.value as DayCountId)}
                >
                  {DAY_COUNTS.map((id) => (
                    <option key={id} value={id}>
                      {DAY_COUNT_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="fixedFrequency" className={LABEL}>
                  Pay frequency
                </label>
                <select
                  id="fixedFrequency"
                  className={FIELD}
                  value={fixedFrequency}
                  onChange={(event) => setFixedFrequency(event.target.value as PayFrequencyId)}
                >
                  {PAY_FREQUENCIES.map((id) => (
                    <option key={id} value={id}>
                      {FREQUENCY_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="gamba-variabile"
            className="rounded-lg border border-rule bg-card p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="gamba-variabile" className="font-serif text-xl">
                Gamba variabile
              </h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withFloating}
                  onChange={(event) => setWithFloating(event.target.checked)}
                />
                Attiva
              </label>
            </div>
            {withFloating ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="floatingRate" className={LABEL}>
                    Tasso variabile (%)
                  </label>
                  <input
                    id="floatingRate"
                    type="number"
                    step="0.01"
                    className={FIELD}
                    value={floatingRate}
                    onChange={(event) => setFloatingRate(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applicato piatto su tutti i periodi: è un&apos;ipotesi, non un fixing forward.
                  </p>
                </div>
                <div>
                  <label htmlFor="floatingDayCount" className={LABEL}>
                    Day count
                  </label>
                  <select
                    id="floatingDayCount"
                    className={FIELD}
                    value={floatingDayCount}
                    onChange={(event) => setFloatingDayCount(event.target.value as DayCountId)}
                  >
                    {DAY_COUNTS.map((id) => (
                      <option key={id} value={id}>
                        {DAY_COUNT_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="floatingFrequency" className={LABEL}>
                    Pay frequency
                  </label>
                  <select
                    id="floatingFrequency"
                    className={FIELD}
                    value={floatingFrequency}
                    onChange={(event) => setFloatingFrequency(event.target.value as PayFrequencyId)}
                  >
                    {PAY_FREQUENCIES.map((id) => (
                      <option key={id} value={id}>
                        {FREQUENCY_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Senza gamba variabile il tool calcola i soli flussi della gamba fissa.
              </p>
            )}
          </section>

          <div>
            <button
              type="button"
              onClick={start}
              disabled={disabled}
              aria-describedby={formError === null ? undefined : "cta-motivo"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {running ? "Calcolo in corso…" : "Avvia calcolo"}
            </button>
            <p
              id="cta-motivo"
              aria-live="polite"
              className="mt-2 min-h-5 text-xs text-muted-foreground"
            >
              {formError ?? "Parametri completi."}
            </p>
          </div>
        </aside>

        <div className="space-y-6">
          {state.phase === "idle" ? (
            <section className="rounded-lg border border-dashed border-rule bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Compila i parametri e premi <strong>Avvia calcolo</strong>. Nulla viene calcolato
                prima.
              </p>
            </section>
          ) : null}

          {state.phase === "calculating" ? (
            <section
              aria-live="polite"
              className="rounded-lg border border-rule bg-card p-8 text-center"
            >
              <p className="text-sm text-muted-foreground">Calcolo in corso…</p>
            </section>
          ) : null}

          {state.phase === "error" ? (
            <section
              aria-live="assertive"
              className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-5"
            >
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-serif text-lg">Il calcolo non è partito</h2>
                <p className="mt-1 text-sm text-muted-foreground">{state.reason}</p>
              </div>
            </section>
          ) : null}

          {state.phase === "result" ? (
            <SwapResultView result={state.result} onExport={exportCsv} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SwapResultView({
  result,
  onExport,
}: {
  readonly result: SwapResult;
  readonly onExport: () => void;
}) {
  const { input, fixedLeg, floatingLeg, netTotal, warnings, audit } = result;
  const money = (value: number) => `${AMOUNT.format(value)} ${input.currency}`;

  return (
    <>
      <section aria-labelledby="sintesi" className="rounded-lg border border-rule bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="sintesi" className="font-serif text-xl">
            Sintesi
          </h2>
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Esporta CSV
          </button>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Gamba fissa</dt>
            <dd className="mt-1 font-serif text-lg">{money(fixedLeg.total)}</dd>
            <dd className="text-xs text-muted-foreground">
              {fixedLeg.ratePercent}% · {DAY_COUNT_LABELS[fixedLeg.dayCount]} ·{" "}
              {FREQUENCY_LABELS[fixedLeg.frequency]}
            </dd>
          </div>
          {floatingLeg === null ? null : (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Gamba variabile
              </dt>
              <dd className="mt-1 font-serif text-lg">{money(floatingLeg.total)}</dd>
              <dd className="text-xs text-muted-foreground">
                {floatingLeg.ratePercent}% · {DAY_COUNT_LABELS[floatingLeg.dayCount]} ·{" "}
                {FREQUENCY_LABELS[floatingLeg.frequency]}
              </dd>
            </div>
          )}
          {netTotal === null ? null : (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Netto, lato payer fisso
              </dt>
              <dd className="mt-1 font-serif text-lg">{money(netTotal)}</dd>
              <dd className="text-xs text-muted-foreground">
                Fisso meno variabile, non attualizzato
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-4 border-t border-rule pt-3 text-xs text-muted-foreground">
          {input.effectiveDate} → {input.maturityDate} · nozionale {money(input.notional)} ·{" "}
          {audit.basis} · motore {audit.engineVersion} · calcolato il {audit.computedAt}
        </p>
      </section>

      <section aria-labelledby="avvisi" className="rounded-lg border border-gold/50 bg-gold/5 p-5">
        <h2 id="avvisi" className="font-serif text-lg">
          Limiti dichiarati
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {warnings.map((warning) => (
            <li key={warning} className="flex gap-2">
              <span aria-hidden="true">·</span>
              <span>{warning}</span>
            </li>
          ))}
          <li className="flex gap-2">
            <span aria-hidden="true">·</span>
            <span>
              Il tool non costruisce una curva e non attualizza i flussi: non produce né un par swap
              rate né un NPV. Gli importi sono interessi maturati, non valori attuali.
            </span>
          </li>
        </ul>
      </section>

      <LegTable leg={fixedLeg} currency={input.currency} />
      {floatingLeg === null ? null : <LegTable leg={floatingLeg} currency={input.currency} />}

      <p className="text-xs text-muted-foreground">
        Il risultato è uno strumento di lavoro e non costituisce consulenza legale o fiscale.
      </p>
    </>
  );
}

function LegTable({ leg, currency }: { readonly leg: LegResult; readonly currency: string }) {
  const id = `gamba-${leg.label.replaceAll(" ", "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="rounded-lg border border-rule bg-card p-5">
      <h2 id={id} className="font-serif text-xl">
        {leg.label}
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Flussi di {leg.label.toLowerCase()} periodo per periodo
          </caption>
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-2 pr-3">
                #
              </th>
              <th scope="col" className="py-2 pr-3">
                Inizio
              </th>
              <th scope="col" className="py-2 pr-3">
                Fine
              </th>
              <th scope="col" className="py-2 pr-3 text-right">
                Giorni
              </th>
              <th scope="col" className="py-2 pr-3 text-right">
                Frazione d&apos;anno
              </th>
              <th scope="col" className="py-2 text-right">
                Interessi
              </th>
            </tr>
          </thead>
          <tbody>
            {leg.periods.map((period) => (
              <tr key={period.index} className="border-b border-rule/50">
                <td className="py-2 pr-3 tabular-nums">
                  {period.index}
                  {period.stub ? (
                    <span className="ml-1 rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">
                      stub
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 tabular-nums">{period.startDate}</td>
                <td className="py-2 pr-3 tabular-nums">{period.endDate}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{period.days}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {FRACTION.format(period.yearFraction)}
                </td>
                <td className="py-2 text-right tabular-nums">{AMOUNT.format(period.interest)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2 pr-3" colSpan={5}>
                Totale {currency}
              </td>
              <td className="py-2 text-right tabular-nums">{AMOUNT.format(leg.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
