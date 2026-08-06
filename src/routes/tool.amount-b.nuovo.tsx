/**
 * Amount B – Procedura guidata di calcolo.
 *
 * Il percorso è diviso in quattro passi di inserimento più il risultato. I
 * campi partono precompilati con il campione Japan del workbook OCSE, così lo
 * strumento è utilizzabile fin dal primo accesso e i valori attesi sono
 * verificabili contro la fonte.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { JurisdictionCombobox } from "../components/tools/amount-b/JurisdictionCombobox";
import { ResultPanel } from "../components/tools/amount-b/ResultPanel";
import { AmountInput, Field, YearHeader, YearSeries } from "../components/tools/amount-b/fields";
import { parseAmount } from "../lib/amount-b/parse";
import { computeAmountB, formatPercent } from "../lib/amount-b/engine";
import {
  DATASET_LABELS,
  DATASET_VERSIONS,
  DEFAULT_DATASET_VERSION,
  getJurisdictions,
  type DatasetVersion,
} from "../lib/amount-b/datasets/registry";
import { PRODUCTS } from "../lib/amount-b/datasets/reference-tables";
import type { IndustryGrouping } from "../lib/amount-b/datasets/types";
import type { AmountBInput, FourYears, ThreeYears } from "../lib/amount-b/model";
import { BS_YEAR_LABELS, PL_YEAR_LABELS } from "../lib/amount-b/model";

const TITLE = "Amount B: calcolo guidato — Osservatorio Transfer Pricing";
const DESCRIPTION =
  "Procedura guidata per il calcolo dell'Approccio Semplificato e Razionalizzato (Pillar One, Amount B): scoping, matrice di pricing, cross-check sui costi operativi e data availability mechanism.";

export const Route = createFileRoute("/tool/amount-b/nuovo")({
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
  component: AmountBWizard,
});

/* -------------------------------------------------------------------------- */
/* Stato del modulo                                                           */
/* -------------------------------------------------------------------------- */

interface FormState {
  jurisdiction: string;
  datasetVersion: DatasetVersion;
  oesUpperBound: string;
  netRevenues: [string, string, string];
  cogs: [string, string, string];
  operatingExpenses: [string, string, string];
  netRevenuesYearX: string;
  operatingExpensesYearX: string;
  fixedAssets: [string, string, string, string];
  debtors: [string, string, string, string];
  stock: [string, string, string, string];
  creditors: [string, string, string, string];
  multiIndustry: boolean;
  groups: [string, string, string];
  groupRevenues: [string, string, string];
}

/** Campione precaricato nei fogli 1 e 2 del workbook OCSE. */
const OECD_SAMPLE: FormState = {
  jurisdiction: "Japan",
  datasetVersion: DEFAULT_DATASET_VERSION,
  oesUpperBound: "30",
  netRevenues: ["199", "195", "205"],
  cogs: ["145", "142", "154"],
  operatingExpenses: ["50", "47", "46"],
  netRevenuesYearX: "200",
  operatingExpensesYearX: "49",
  fixedAssets: ["60", "40", "44", "36"],
  debtors: ["35", "25", "19", "33"],
  stock: ["30", "20", "16", "34"],
  creditors: ["33", "33", "35", "37"],
  multiIndustry: false,
  groups: ["1", "3", "2"],
  groupRevenues: ["120", "50", "30"],
};

const three = (v: readonly string[]): ThreeYears => [
  parseAmount(v[0] ?? ""),
  parseAmount(v[1] ?? ""),
  parseAmount(v[2] ?? ""),
];

const four = (v: readonly string[]): FourYears => [
  parseAmount(v[0] ?? ""),
  parseAmount(v[1] ?? ""),
  parseAmount(v[2] ?? ""),
  parseAmount(v[3] ?? ""),
];

const asGrouping = (raw: string): IndustryGrouping => {
  const n = Number(raw);
  return n === 2 ? 2 : n === 3 ? 3 : 1;
};

function toInput(form: FormState): AmountBInput {
  const industry: AmountBInput["industry"] = form.multiIndustry
    ? {
        kind: "multi",
        first: {
          industryGrouping: asGrouping(form.groups[0]),
          netRevenues: parseAmount(form.groupRevenues[0]),
        },
        ...(parseAmount(form.groupRevenues[1]) > 0
          ? {
              second: {
                industryGrouping: asGrouping(form.groups[1]),
                netRevenues: parseAmount(form.groupRevenues[1]),
              },
            }
          : {}),
        ...(parseAmount(form.groupRevenues[2]) > 0
          ? {
              third: {
                industryGrouping: asGrouping(form.groups[2]),
                netRevenues: parseAmount(form.groupRevenues[2]),
              },
            }
          : {}),
      }
    : { kind: "single", industryGrouping: asGrouping(form.groups[0]) };

  return {
    jurisdiction: form.jurisdiction,
    datasetVersion: form.datasetVersion,
    oesUpperBound: parseAmount(form.oesUpperBound) / 100,
    netRevenues: three(form.netRevenues),
    cogs: three(form.cogs),
    operatingExpenses: three(form.operatingExpenses),
    netRevenuesYearX: parseAmount(form.netRevenuesYearX),
    operatingExpensesYearX: parseAmount(form.operatingExpensesYearX),
    fixedAssets: four(form.fixedAssets),
    debtors: four(form.debtors),
    stock: four(form.stock),
    creditors: four(form.creditors),
    industry,
  };
}

/* -------------------------------------------------------------------------- */
/* Passi                                                                      */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { title: "Giurisdizione", summary: "Paese della tested party e data table" },
  { title: "Scoping", summary: "Ricavi e costi operativi del triennio" },
  { title: "Dati economici", summary: "Costo del venduto, esercizio x e patrimoniale" },
  { title: "Industry grouping", summary: "Categorie di prodotto distribuite" },
  { title: "Risultato", summary: "Return on sales e catena di calcolo" },
] as const;

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background";

/* -------------------------------------------------------------------------- */

function AmountBWizard() {
  const [form, setForm] = useState<FormState>(OECD_SAMPLE);
  const [step, setStep] = useState(0);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setAt = (key: "netRevenues" | "cogs" | "operatingExpenses", i: number, value: string) =>
    setForm((f) => {
      const next = [...f[key]] as [string, string, string];
      next[i] = value;
      return { ...f, [key]: next };
    });

  const setBs = (
    key: "fixedAssets" | "debtors" | "stock" | "creditors",
    i: number,
    value: string,
  ) =>
    setForm((f) => {
      const next = [...f[key]] as [string, string, string, string];
      next[i] = value;
      return { ...f, [key]: next };
    });

  const jurisdictions = useMemo(() => getJurisdictions(form.datasetVersion), [form.datasetVersion]);
  const selected = useMemo(
    () => jurisdictions.find((j) => j.jurisdiction === form.jurisdiction) ?? null,
    [jurisdictions, form.jurisdiction],
  );
  const result = useMemo(() => computeAmountB(toInput(form)), [form]);

  const isLast = step === STEPS.length - 1;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Tool · Pillar One
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">Amount B, calcolo guidato</h1>
        <button
          type="button"
          onClick={() => {
            setForm(OECD_SAMPLE);
            setStep(0);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Ricarica il campione OCSE
        </button>
      </div>

      {/* Barra di avanzamento */}
      <nav aria-label="Passi del calcolo" className="mt-8">
        <ol className="grid gap-2 sm:grid-cols-5">
          {STEPS.map((s, i) => {
            const state = i === step ? "current" : i < step ? "done" : "todo";
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={state === "current" ? "step" : undefined}
                  className={`w-full border-t-2 pt-2 text-left transition-colors ${
                    state === "current"
                      ? "border-petrol"
                      : state === "done"
                        ? "border-petrol/40 hover:border-petrol"
                        : "border-rule hover:border-input"
                  }`}
                >
                  <span
                    className={`block text-xs tabular-nums ${
                      state === "todo" ? "text-muted-foreground" : "text-petrol"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.summary}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Indicatori dal vivo */}
      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-rule bg-surface px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">OES </span>
          <span className="font-medium tabular-nums">{formatPercent(result.scoping.oes)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">OAS </span>
          <span className="font-medium tabular-nums">
            {formatPercent(result.factorIntensity.oas)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Factor intensity </span>
          <span className="font-medium">{result.factorIntensity.classification ?? "—"}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Return finale </span>
          <span className="font-medium tabular-nums">
            {formatPercent(result.finalReturnOnSales)}
          </span>
        </span>
      </div>

      <div className="mt-8">
        {/* Passo 1 – Giurisdizione */}
        {step === 0 ? (
          <section aria-labelledby="p1" className="space-y-6">
            <h2 id="p1" className="font-serif text-2xl">
              Giurisdizione della tested party
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field
                label="Giurisdizione"
                hint="La presenza nella tabella OCSE non implica che la giurisdizione abbia adottato l'approccio semplificato."
              >
                {() => (
                  <div className="mt-1">
                    <JurisdictionCombobox
                      jurisdictions={jurisdictions}
                      value={form.jurisdiction}
                      onChange={(v) => set("jurisdiction", v)}
                    />
                  </div>
                )}
              </Field>

              <Field
                label="Data table di riferimento"
                hint="Tra dicembre 2024 e gennaio 2026 sono cambiati i rating sovrani di trenta giurisdizioni: la scelta incide sulla Section 5.3."
              >
                {(id) => (
                  <select
                    id={id}
                    value={form.datasetVersion}
                    onChange={(e) => set("datasetVersion", e.target.value as DatasetVersion)}
                    className={`mt-1 ${inputClass}`}
                  >
                    {DATASET_VERSIONS.map((v) => (
                      <option key={v} value={v}>
                        {DATASET_LABELS[v]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            {selected ? (
              <dl className="grid gap-4 rounded-lg border border-rule bg-surface p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Gruppo di reddito
                  </dt>
                  <dd className="mt-0.5">{selected.incomeGroup}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Fasce cap (Section 5.2)
                  </dt>
                  <dd className="mt-0.5">
                    {selected.capRatesApplicable === "Alternative cap rates"
                      ? "Alternative"
                      : "Standard"}{" "}
                    <span className="text-muted-foreground">· Category {selected.category}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Data availability mechanism
                  </dt>
                  <dd className="mt-0.5">
                    {selected.damQualifying ? "Giurisdizione qualificata" : "Non qualificata"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Rating sovrano usato
                  </dt>
                  <dd className="mt-0.5">
                    {selected.creditRatingUsed === "-"
                      ? "Non attribuito"
                      : selected.creditRatingUsed}
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>
        ) : null}

        {/* Passo 2 – Scoping */}
        {step === 1 ? (
          <section aria-labelledby="p2" className="space-y-6">
            <h2 id="p2" className="font-serif text-2xl">
              Criterio quantitativo di scoping
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              I costi operativi medi del triennio, rapportati ai ricavi netti medi, devono essere
              compresi tra il 3% e il limite superiore fissato dalla giurisdizione.
            </p>

            <div className="space-y-4 rounded-lg border border-rule bg-card p-5">
              <YearHeader labels={PL_YEAR_LABELS} />
              <YearSeries
                label="Ricavi netti"
                labels={PL_YEAR_LABELS}
                values={form.netRevenues}
                onChange={(i, v) => setAt("netRevenues", i, v)}
              />
              <YearSeries
                label="Costi operativi"
                labels={PL_YEAR_LABELS}
                values={form.operatingExpenses}
                onChange={(i, v) => setAt("operatingExpenses", i, v)}
              />
            </div>

            <div className="max-w-xs">
              <Field
                label="Limite superiore dell'OES (%)"
                hint="Compreso tra il 20% e il 30%, secondo quanto richiesto dalla giurisdizione."
              >
                {(id) => (
                  <div className="mt-1">
                    <AmountInput
                      id={id}
                      value={form.oesUpperBound}
                      onChange={(v) => set("oesUpperBound", v)}
                    />
                  </div>
                )}
              </Field>
            </div>

            <p
              aria-live="polite"
              className={`rounded-md border p-3 text-sm ${
                result.scoping.verdict === "Quantitative scoping criteria met"
                  ? "border-petrol/30 bg-accent/40"
                  : "border-gold/50 bg-gold/5"
              }`}
            >
              OES {formatPercent(result.scoping.oes)}.{" "}
              {result.scoping.verdict === "Quantitative scoping criteria met"
                ? "Il criterio quantitativo è soddisfatto."
                : "Il criterio quantitativo non è soddisfatto: l'approccio semplificato non è utilizzabile."}
            </p>
          </section>
        ) : null}

        {/* Passo 3 – Dati economici e patrimoniali */}
        {step === 2 ? (
          <section aria-labelledby="p3" className="space-y-6">
            <h2 id="p3" className="font-serif text-2xl">
              Dati economici e patrimoniali
            </h2>

            <div className="space-y-4 rounded-lg border border-rule bg-card p-5">
              <h3 className="text-sm font-semibold">Conto economico del triennio</h3>
              <YearHeader labels={PL_YEAR_LABELS} />
              <YearSeries
                label="Costo del venduto"
                labels={PL_YEAR_LABELS}
                values={form.cogs}
                onChange={(i, v) => setAt("cogs", i, v)}
              />
            </div>

            <div className="grid gap-4 rounded-lg border border-rule bg-card p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <h3 className="text-sm font-semibold">Esercizio x, anno da prezzare</h3>
              </div>
              <Field label="Ricavi netti">
                {(id) => (
                  <div className="mt-1">
                    <AmountInput
                      id={id}
                      value={form.netRevenuesYearX}
                      onChange={(v) => set("netRevenuesYearX", v)}
                    />
                  </div>
                )}
              </Field>
              <Field label="Costi operativi">
                {(id) => (
                  <div className="mt-1">
                    <AmountInput
                      id={id}
                      value={form.operatingExpensesYearX}
                      onChange={(v) => set("operatingExpensesYearX", v)}
                    />
                  </div>
                )}
              </Field>
            </div>

            <div className="space-y-4 rounded-lg border border-rule bg-card p-5">
              <div>
                <h3 className="text-sm font-semibold">Stato patrimoniale</h3>
                <p className="text-xs text-muted-foreground">
                  Servono quattro esercizi perché ogni voce entra nel calcolo come media tra saldo
                  di apertura e saldo di chiusura. Se lo storico è più breve, lasciare a zero gli
                  esercizi mancanti più remoti.
                </p>
              </div>
              <YearHeader labels={BS_YEAR_LABELS} />
              <YearSeries
                label="Immobilizzazioni"
                labels={BS_YEAR_LABELS}
                values={form.fixedAssets}
                onChange={(i, v) => setBs("fixedAssets", i, v)}
              />
              <YearSeries
                label="Crediti commerciali"
                labels={BS_YEAR_LABELS}
                values={form.debtors}
                onChange={(i, v) => setBs("debtors", i, v)}
              />
              <YearSeries
                label="Rimanenze"
                labels={BS_YEAR_LABELS}
                values={form.stock}
                onChange={(i, v) => setBs("stock", i, v)}
              />
              <YearSeries
                label="Debiti commerciali"
                hint="Oltre 90 giorni scatta il guardrail."
                labels={BS_YEAR_LABELS}
                values={form.creditors}
                onChange={(i, v) => setBs("creditors", i, v)}
              />
            </div>
          </section>
        ) : null}

        {/* Passo 4 – Industry grouping */}
        {step === 3 ? (
          <section aria-labelledby="p4" className="space-y-6">
            <h2 id="p4" className="font-serif text-2xl">
              Industry grouping
            </h2>

            <fieldset>
              <legend className="text-sm font-semibold">Categorie distribuite</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: false,
                    label: "Un solo industry grouping",
                    hint: "Tutti i prodotti ricadono nella stessa categoria.",
                  },
                  {
                    value: true,
                    label: "Più industry grouping",
                    hint: "Si applica la de minimis del 20% sulle categorie minori.",
                  },
                ].map((option) => (
                  <label
                    key={String(option.value)}
                    className="flex cursor-pointer gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-petrol has-[:checked]:bg-accent/40"
                  >
                    <input
                      type="radio"
                      name="multiIndustry"
                      checked={form.multiIndustry === option.value}
                      onChange={() => set("multiIndustry", option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-4 rounded-lg border border-rule bg-card p-5">
              {(form.multiIndustry ? [0, 1, 2] : [0]).map((i) => (
                <div key={i} className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={
                      form.multiIndustry
                        ? i === 0
                          ? "Prima categoria (quota maggiore)"
                          : i === 1
                            ? "Seconda categoria"
                            : "Terza categoria"
                        : "Industry grouping"
                    }
                  >
                    {(id) => (
                      <select
                        id={id}
                        value={form.groups[i] ?? "1"}
                        onChange={(e) =>
                          setForm((f) => {
                            const next = [...f.groups] as [string, string, string];
                            next[i] = e.target.value;
                            return { ...f, groups: next };
                          })
                        }
                        className={`mt-1 ${inputClass}`}
                      >
                        <option value="1">Gruppo 1</option>
                        <option value="2">Gruppo 2</option>
                        <option value="3">Gruppo 3</option>
                      </select>
                    )}
                  </Field>
                  {form.multiIndustry ? (
                    <Field label="Ricavi netti dell'esercizio x">
                      {(id) => (
                        <div className="mt-1">
                          <AmountInput
                            id={id}
                            value={form.groupRevenues[i] ?? ""}
                            onChange={(v) =>
                              setForm((f) => {
                                const next = [...f.groupRevenues] as [string, string, string];
                                next[i] = v;
                                return { ...f, groupRevenues: next };
                              })
                            }
                          />
                        </div>
                      )}
                    </Field>
                  ) : null}
                </div>
              ))}
            </div>

            <details className="rounded-lg border border-rule bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">
                In quale gruppo ricade un prodotto?
              </summary>
              <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {PRODUCTS.map((p) => (
                  <li
                    key={p.product}
                    className="flex justify-between gap-4 border-b border-rule/60 py-1"
                  >
                    <span>{p.product}</span>
                    <span className="shrink-0 text-muted-foreground">
                      gruppo {p.industryGrouping}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}

        {/* Passo 5 – Risultato */}
        {isLast ? <ResultPanel result={result} /> : null}
      </div>

      {/* Navigazione */}
      <div className="mt-10 flex items-center justify-between border-t border-rule pt-6">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40 hover:enabled:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Indietro
        </button>

        {isLast ? (
          <Link
            to="/tool/amount-b"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Torna alla scheda dello strumento
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            {step === STEPS.length - 2 ? "Vedi il risultato" : "Avanti"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
