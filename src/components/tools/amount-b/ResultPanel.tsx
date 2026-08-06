/**
 * Amount B – Presentazione dell'esito del calcolo.
 *
 * Il pannello mostra il return finale e, sotto, la catena che lo produce:
 * scoping, guardrail, factor intensity, matrice, cross-check e data
 * availability mechanism. Ogni passaggio riporta i valori intermedi, perché
 * il risultato deve poter essere ricostruito da chi lo legge.
 */

import { AlertTriangle, ArrowRight, Ban, Check, Info, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { formatDays, formatNumber, formatPercent } from "../../../lib/amount-b/engine";
import type { AmountBResult } from "../../../lib/amount-b/model";
import { DATASET_LABELS } from "../../../lib/amount-b/datasets/registry";

/* -------------------------------------------------------------------------- */

type StepStatus = "ok" | "attention" | "blocked" | "neutral";

const STATUS_STYLE: Record<StepStatus, { readonly dot: string; readonly icon: ReactNode }> = {
  ok: { dot: "bg-petrol", icon: <Check className="h-3.5 w-3.5" aria-hidden="true" /> },
  attention: {
    dot: "bg-gold",
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  blocked: { dot: "bg-destructive", icon: <Ban className="h-3.5 w-3.5" aria-hidden="true" /> },
  neutral: { dot: "bg-border", icon: <Minus className="h-3.5 w-3.5" aria-hidden="true" /> },
};

interface StepProps {
  readonly index: number;
  readonly title: string;
  readonly status: StepStatus;
  readonly verdict: string;
  readonly children?: ReactNode;
}

/** Un anello della catena di calcolo. */
function Step({ index, title, status, verdict, children }: StepProps) {
  const style = STATUS_STYLE[status];
  return (
    <li className="relative pl-10">
      <span
        className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full text-primary-foreground ${style.dot}`}
      >
        {style.icon}
      </span>
      <div className="border-b border-rule pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-serif text-lg">
            <span className="mr-2 text-sm text-muted-foreground tabular-nums">{index}.</span>
            {title}
          </h3>
          <span className="text-sm font-medium">{verdict}</span>
        </div>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}

/** Coppia etichetta/valore, allineata per la lettura a colpo d'occhio. */
function Metric({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function MetricRow({ children }: { readonly children: ReactNode }) {
  return <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{children}</dl>;
}

/* -------------------------------------------------------------------------- */

/**
 * Barra della fascia accettabile.
 *
 * Il return della matrice produce un intervallo pari al valore centrale più o
 * meno 0,5 punti percentuali; la barra lo rende leggibile senza dover fare il
 * conto a mente.
 */
function RangeBar({
  lower,
  center,
  upper,
  final,
}: {
  readonly lower: number;
  readonly center: number;
  readonly upper: number;
  readonly final: number | null;
}) {
  const span = upper - lower;
  const position = (v: number) => Math.min(100, Math.max(0, ((v - lower) / span) * 100));
  const finalInside = final !== null && final >= lower && final <= upper;

  return (
    <div>
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-accent" />
        <div
          className="absolute top-3 h-4 w-0.5 bg-petrol"
          style={{ left: `${position(center)}%` }}
          aria-hidden="true"
        />
        {finalInside ? (
          <div
            className="absolute top-2 h-6 w-6 -translate-x-3 rounded-full border-2 border-gold bg-card"
            style={{ left: `${position(final)}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatPercent(lower)}</span>
        <span className="font-medium text-foreground">matrice {formatPercent(center)}</span>
        <span>{formatPercent(upper)}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function ResultPanel({ result }: { readonly result: AmountBResult }) {
  const {
    scoping,
    factorIntensity,
    section51,
    section52,
    section53,
    accountsPayable,
    capital,
    metadata,
  } = result;

  const scopingMet = scoping.verdict === "Quantitative scoping criteria met";

  if (result.errors.length > 0) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="flex items-center gap-2 font-serif text-lg">
          <Ban className="h-4 w-4 text-destructive" aria-hidden="true" />
          Calcolo non eseguibile
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {result.errors.map((e) => (
            <li key={e.code}>{e.message}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Esito principale */}
      <section
        aria-labelledby="esito-finale"
        className={`rounded-lg border p-6 ${
          scopingMet ? "border-petrol/30 bg-surface" : "border-gold/50 bg-gold/5"
        }`}
      >
        <h2
          id="esito-finale"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Return on sales finale ai sensi della Section 5
        </h2>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="font-serif text-5xl tabular-nums">
            {formatPercent(result.finalReturnOnSales)}
          </p>
          {result.finalEbit !== null ? (
            <p className="pb-2 text-sm text-muted-foreground">
              EBIT corrispondente sull&apos;esercizio x: {formatNumber(result.finalEbit)}
            </p>
          ) : null}
        </div>

        {section51.rangeLower !== null &&
        section51.rangeUpper !== null &&
        section51.returnOnSales !== null ? (
          <div className="mt-5 max-w-xl">
            <RangeBar
              lower={section51.rangeLower}
              center={section51.returnOnSales}
              upper={section51.rangeUpper}
              final={result.finalReturnOnSales}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Qualsiasi punto della fascia può essere assunto per dimostrare la conformità alla
              Section 5.1 e costituisce la base delle eventuali rettifiche delle Section 5.2 e 5.3.
            </p>
          </div>
        ) : null}

        {!scopingMet ? (
          <p className="mt-5 flex gap-2 rounded-md border border-gold/50 bg-card p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <span>
              Il criterio quantitativo di scoping non è soddisfatto: l&apos;approccio semplificato e
              razionalizzato non è utilizzabile. I valori qui sotto restano visibili per capire da
              cosa dipende l&apos;esito.
            </span>
          </p>
        ) : null}

        <p className="mt-4 flex gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Lo strumento automatizza il solo criterio quantitativo. Gli elementi qualitativi dei
            paragrafi 13.a e 14 della guidance vanno valutati separatamente prima di concludere
            sull&apos;applicabilità dell&apos;approccio.
          </span>
        </p>
      </section>

      {/* Avvertimenti */}
      {result.warnings.length > 0 ? (
        <section
          aria-label="Avvertimenti"
          className="rounded-lg border border-gold/50 bg-gold/5 p-4"
        >
          <ul className="space-y-2 text-sm">
            {result.warnings.map((w) => (
              <li key={w.code} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Catena di calcolo */}
      <section aria-labelledby="catena">
        <h2 id="catena" className="font-serif text-2xl">
          Come si arriva al risultato
        </h2>
        <ol className="mt-6 space-y-6">
          <Step
            index={1}
            title="Criterio quantitativo di scoping"
            status={scopingMet ? "ok" : "blocked"}
            verdict={scopingMet ? "Soddisfatto" : "Non soddisfatto"}
          >
            <MetricRow>
              <Metric
                label="OES"
                value={formatPercent(scoping.oes)}
                note="costi operativi su ricavi netti, media triennale ponderata"
              />
              <Metric label="Limite inferiore" value={formatPercent(scoping.lowerBound)} />
              <Metric
                label="Limite superiore"
                value={formatPercent(scoping.upperBound)}
                note="fissato dalla giurisdizione"
              />
            </MetricRow>
          </Step>

          <Step
            index={2}
            title="Guardrail sui debiti commerciali"
            status={result.guardrailTriggered ? "attention" : "ok"}
            verdict={
              result.guardrailTriggered
                ? "Attivato: debiti rettificati"
                : "Non attivato: entro i 90 giorni"
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Giorni di debito commerciale per esercizio e debiti usati nel capitale circolante
                </caption>
                <thead>
                  <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Esercizio
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Debiti medi
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Costo del venduto
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Giorni
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Debiti usati
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {accountsPayable.map((y) => (
                    <tr key={y.yearLabel} className="border-b border-rule/60">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {y.yearLabel}
                      </th>
                      <td className="py-2 pr-4">{formatNumber(y.averageCreditors)}</td>
                      <td className="py-2 pr-4">{formatNumber(y.cogs)}</td>
                      <td className="py-2 pr-4">
                        {formatDays(y.days)}
                        {y.meetsThreshold === false ? (
                          <span className="ml-2 rounded-full border border-gold px-1.5 py-0.5 text-xs">
                            oltre 90
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2">{formatNumber(y.creditorsUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Step>

          <Step
            index={3}
            title="Factor intensity"
            status={factorIntensity.classification ? "ok" : "neutral"}
            verdict={
              factorIntensity.classification
                ? `Categoria ${factorIntensity.classification}`
                : "Indeterminata"
            }
          >
            <MetricRow>
              <Metric
                label="OAS"
                value={formatPercent(factorIntensity.oas)}
                note="attività operative nette su ricavi netti"
              />
              <Metric label="OES" value={formatPercent(factorIntensity.oes)} />
              {factorIntensity.classificationWithoutGuardrail ? (
                <Metric
                  label="Senza guardrail sarebbe"
                  value={`Categoria ${factorIntensity.classificationWithoutGuardrail}`}
                  note="effetto del guardrail sui debiti"
                />
              ) : null}
            </MetricRow>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Capitale circolante e attività operative nette per esercizio
                </caption>
                <thead>
                  <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Esercizio
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Rimanenze
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Crediti
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Immobilizzazioni
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Circolante
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Attività op. nette
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {capital.map((c) => (
                    <tr key={c.yearLabel} className="border-b border-rule/60">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {c.yearLabel}
                      </th>
                      <td className="py-2 pr-4">{formatNumber(c.averageStock)}</td>
                      <td className="py-2 pr-4">{formatNumber(c.averageDebtors)}</td>
                      <td className="py-2 pr-4">{formatNumber(c.averageFixedAssets)}</td>
                      <td className="py-2 pr-4">{formatNumber(c.workingCapital)}</td>
                      <td className="py-2">{formatNumber(c.netOperatingAssets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Le voci patrimoniali entrano nel calcolo come media tra saldo di apertura e saldo di
              chiusura, non come saldo puntuale.
            </p>
          </Step>

          <Step
            index={4}
            title="Section 5.1 – matrice di pricing"
            status={section51.returnOnSales !== null ? "ok" : "neutral"}
            verdict={
              section51.returnOnSales !== null
                ? formatPercent(section51.returnOnSales)
                : "Non determinato"
            }
          >
            <MetricRow>
              <Metric
                label="Industry grouping"
                value={
                  section51.weightedAverageRequired
                    ? "Media ponderata"
                    : section51.industryGrouping
                      ? `Gruppo ${section51.industryGrouping}`
                      : "—"
                }
              />
              <Metric
                label="Factor intensity"
                value={factorIntensity.classification ?? "—"}
                note="riga della matrice"
              />
              {section51.deMinimisExceeded !== null ? (
                <Metric
                  label="De minimis del 20%"
                  value={section51.deMinimisExceeded ? "Superata" : "Non superata"}
                  note="quote della seconda e terza categoria"
                />
              ) : null}
            </MetricRow>
            {section51.components.length > 1 ? (
              <ul className="mt-4 space-y-1 text-sm tabular-nums">
                {section51.components.map((c, i) => (
                  <li key={`${c.industryGrouping}-${i}`} className="flex flex-wrap gap-2">
                    <span className="text-muted-foreground">Gruppo {c.industryGrouping}</span>
                    <span>quota {formatPercent(c.share)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>{formatPercent(c.matrixReturn)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Step>

          <Step
            index={5}
            title="Section 5.2 – cross-check sui costi operativi"
            status={section52.adjustmentRequired ? "attention" : "ok"}
            verdict={
              section52.adjustmentRequired
                ? `Rettifica: ${formatPercent(section52.adjustedReturnOnSales)}`
                : "Nessuna rettifica"
            }
          >
            <MetricRow>
              <Metric
                label="Rendimento su OpEx"
                value={formatPercent(section52.equivalentReturnOnOpEx)}
              />
              <Metric
                label="Cap applicabile"
                value={formatPercent(section52.cap)}
                note={`${section52.band ?? "—"} · ${section52.capRatesApplicable}`}
              />
              <Metric label="Collar" value={formatPercent(section52.collar)} />
              <Metric
                label="Esito"
                value={
                  section52.capTriggered
                    ? "Cap superato"
                    : section52.collarTriggered
                      ? "Sotto il collar"
                      : "Dentro la fascia"
                }
              />
            </MetricRow>
          </Step>

          <Step
            index={6}
            title="Section 5.3 – data availability mechanism"
            status={section53.adjustmentRequired ? "attention" : "ok"}
            verdict={
              section53.adjustmentRequired
                ? `Rettifica: +${formatPercent(section53.adjustment)}`
                : "Giurisdizione non qualificata"
            }
          >
            <MetricRow>
              <Metric
                label="Giurisdizione qualificata"
                value={section53.damQualifying ? "Sì" : "No"}
              />
              <Metric
                label="Rating sovrano"
                value={section53.creditRating === "-" ? "Non attribuito" : section53.creditRating}
              />
              <Metric
                label="Net risk adjustment"
                value={formatPercent(section53.netRiskAdjustment)}
              />
              <Metric
                label="OAS con cap 85%"
                value={formatPercent(section53.oasCapped)}
                note="base della rettifica"
              />
            </MetricRow>
          </Step>
        </ol>
      </section>

      {/* Provenienza dei dati */}
      <section
        aria-labelledby="provenienza"
        className="rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground"
      >
        <h2 id="provenienza" className="font-medium text-foreground">
          Provenienza dei dati
        </h2>
        <p className="mt-2">
          Workbook OCSE versione {metadata.workbookVersion} ·{" "}
          {DATASET_LABELS[metadata.jurisdictionDatasetVersion]} · matrice di pricing{" "}
          {metadata.pricingMatrixVersion}
        </p>
        <p className="mt-1 font-mono">
          checksum giurisdizioni {metadata.datasetChecksums.jurisdictions} · tabelle di riferimento{" "}
          {metadata.datasetChecksums.referenceTables} · matrice{" "}
          {metadata.datasetChecksums.pricingMatrix}
        </p>
      </section>
    </div>
  );
}
