import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info } from "lucide-react";

import { computeRavvedimento, formatEuroCents, formatRateBp } from "../lib/ravvedimento/engine";
import {
  LEGAL_INTEREST_COVERED_THROUGH,
  LEGAL_INTEREST_DATASET_VERSION,
} from "../lib/ravvedimento/datasets/legal-interest-rates/manifest";
import type { RavvedimentoInput, ViolationType } from "../lib/ravvedimento/types";

const TITLE = "Ravvedimento spontaneo — calcolo interessi e sanzioni ridotte";
const DESCRIPTION =
  "Calcolo dimostrativo del ravvedimento per versamenti omessi, insufficienti o tardivi: interessi legali per anno, sanzione ridotta e dettaglio del calcolo.";

export const Route = createFileRoute("/tool/ravvedimento")({
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
  component: RavvedimentoPage,
});

const VIOLATIONS: Array<{ value: ViolationType; label: string; hint: string }> = [
  {
    value: "OMITTED_PAYMENT",
    label: "Omesso versamento",
    hint: "Il tributo non è stato versato entro la scadenza.",
  },
  {
    value: "INSUFFICIENT_PAYMENT",
    label: "Versamento insufficiente",
    hint: "È stato versato un importo inferiore al dovuto.",
  },
  {
    value: "LATE_PAYMENT",
    label: "Versamento tardivo",
    hint: "Il versamento è stato eseguito dopo la scadenza.",
  },
];

function RavvedimentoPage() {
  const [form, setForm] = useState({
    violationType: "OMITTED_PAYMENT" as ViolationType,
    amountDue: "10000",
    amountPaid: "",
    originalDueDate: "2024-06-30",
    paymentDate: "2025-03-31",
    noticeReceived: false,
    formalAssessmentStarted: false,
  });
  const [submitted, setSubmitted] = useState<RavvedimentoInput | null>(null);

  const outcome = useMemo(
    () => (submitted ? computeRavvedimento(submitted) : null),
    [submitted],
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool</p>
      <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">Ravvedimento spontaneo</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Regolarizzazione di versamenti omessi, insufficienti o tardivi: interessi legali calcolati
        anno per anno e sanzione ridotta secondo il regime vigente alla data della violazione.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 font-medium">DEMO</span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Dataset tassi legali: {LEGAL_INTEREST_DATASET_VERSION}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Copertura fino al {LEGAL_INTEREST_COVERED_THROUGH}
        </span>
      </div>

      <form
        className="mt-8 space-y-6 rounded-lg border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted({
            violationType: form.violationType,
            amountDue: Number(form.amountDue.replace(",", ".")),
            amountPaid: form.amountPaid ? Number(form.amountPaid.replace(",", ".")) : 0,
            originalDueDate: form.originalDueDate,
            paymentDate: form.paymentDate,
            noticeReceived: form.noticeReceived,
            formalAssessmentStarted: form.formalAssessmentStarted,
          });
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold">Violazione da regolarizzare</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {VIOLATIONS.map((violation) => (
              <label
                key={violation.value}
                className="flex cursor-pointer gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40"
              >
                <input
                  type="radio"
                  name="violationType"
                  value={violation.value}
                  checked={form.violationType === violation.value}
                  onChange={() => setForm((f) => ({ ...f, violationType: violation.value }))}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{violation.label}</span>
                  <span className="block text-xs text-muted-foreground">{violation.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="amountDue" className="text-sm font-medium">
              Importo dovuto (EUR)
            </label>
            <input
              id="amountDue"
              inputMode="decimal"
              required
              value={form.amountDue}
              onChange={(e) => setForm((f) => ({ ...f, amountDue: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {form.violationType === "INSUFFICIENT_PAYMENT" && (
            <div>
              <label htmlFor="amountPaid" className="text-sm font-medium">
                Importo già versato (EUR)
              </label>
              <input
                id="amountPaid"
                inputMode="decimal"
                value={form.amountPaid}
                onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label htmlFor="originalDueDate" className="text-sm font-medium">
              Scadenza originaria
            </label>
            <input
              id="originalDueDate"
              type="date"
              required
              value={form.originalDueDate}
              onChange={(e) => setForm((f) => ({ ...f, originalDueDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="paymentDate" className="text-sm font-medium">
              Data del versamento
            </label>
            <input
              id="paymentDate"
              type="date"
              required
              value={form.paymentDate}
              onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Cause ostative</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.noticeReceived}
              onChange={(e) => setForm((f) => ({ ...f, noticeReceived: e.target.checked }))}
            />
            Ho ricevuto un atto di liquidazione o accertamento
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.formalAssessmentStarted}
              onChange={(e) =>
                setForm((f) => ({ ...f, formalAssessmentStarted: e.target.checked }))
              }
            />
            Sono già iniziate attività di controllo formalmente notificate
          </label>
        </fieldset>

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Calcola ravvedimento
        </button>
      </form>

      <section aria-live="polite" className="mt-8">
        {outcome?.status === "blocked" && (
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Calcolo non eseguito</h2>
              <p className="mt-1 text-sm text-muted-foreground">{outcome.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">Codice: {outcome.reason}</p>
            </div>
          </div>
        )}

        {outcome?.status === "ok" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi label="Imposta da versare" value={formatEuroCents(outcome.baseCents)} />
              <Kpi label="Interessi legali" value={formatEuroCents(outcome.interestCents)} />
              <Kpi label="Sanzione ridotta" value={formatEuroCents(outcome.penaltyCents)} />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Totale da versare</p>
              <p className="mt-1 font-serif text-3xl font-bold">
                {formatEuroCents(outcome.totalCents)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Giorni di ritardo: {outcome.daysLate} — {outcome.dayCountConvention}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Dettaglio interessi per anno</h2>
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Segmenti di calcolo degli interessi legali</caption>
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Periodo</th>
                      <th scope="col" className="px-3 py-2 font-medium">Giorni</th>
                      <th scope="col" className="px-3 py-2 font-medium">Divisore</th>
                      <th scope="col" className="px-3 py-2 font-medium">Tasso</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Interessi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.interestSegments.map((segment) => (
                      <tr key={segment.year} className="border-t border-border">
                        <td className="px-3 py-2">
                          {segment.from} → {segment.to}
                        </td>
                        <td className="px-3 py-2">{segment.days}</td>
                        <td className="px-3 py-2">{segment.yearDays}</td>
                        <td className="px-3 py-2">{formatRateBp(segment.rateBp)}</td>
                        <td className="px-3 py-2 text-right">
                          {formatEuroCents(segment.interestCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold">Sanzione applicata</h2>
              <p className="mt-1 text-sm">
                {outcome.penaltyBand.description} — aliquota effettiva{" "}
                {formatRateBp(outcome.penaltyBand.effectiveRateBp)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {outcome.penaltyBand.legalReference}
              </p>
            </div>

            <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <Info className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div className="text-xs text-muted-foreground">
                <ul className="list-disc space-y-1 pl-4">
                  {outcome.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  Versioni: modello {outcome.modelVersion} · tassi {outcome.interestDatasetVersion} ·
                  sanzioni {outcome.penaltyRulesetVersion} ({outcome.penaltyRulesetStatus}).
                </p>
                <p className="mt-2">
                  Strumento dimostrativo: il risultato non costituisce consulenza fiscale e va
                  verificato con un professionista. Nessun dato viene inviato o conservato.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}