/**
 * Valora Suite — modulo WACC. Calcolo puro su input dimostrativi.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";

import { getItem, getSource } from "../lib/valora/catalog";
import { computeWacc, formatBp, formatMilli, type WaccInput } from "../lib/valora/wacc";

const TITLE = "WACC — costo medio ponderato del capitale | Valora Suite";
const DESCRIPTION =
  "Calcolo dimostrativo del WACC: costo dell'equity, costo del debito netto d'imposta e pesi della struttura finanziaria, con catena formula → dataset → fonte → versione.";

export const Route = createFileRoute("/tool/valora/wacc")({
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
  component: WaccModule,
});

interface FieldSpec {
  readonly key: keyof WaccInput;
  readonly label: string;
  readonly hint: string;
}

const FIELDS: readonly FieldSpec[] = [
  { key: "riskFreeBp", label: "Tasso privo di rischio (bp)", hint: "100 bp = 1,00%" },
  { key: "equityRiskPremiumBp", label: "Equity risk premium (bp)", hint: "Premio per il rischio azionario" },
  { key: "countryRiskPremiumBp", label: "Country risk premium (bp)", hint: "Componente additiva di rischio paese" },
  { key: "betaUnleveredMilli", label: "Beta unlevered (millesimi)", hint: "1000 = 1,00" },
  { key: "creditSpreadBp", label: "Credit spread (bp)", hint: "Spread sul costo del debito" },
  { key: "taxRateBp", label: "Aliquota fiscale (bp)", hint: "2400 = 24,00%" },
  { key: "debt", label: "Debito finanziario", hint: "Unità monetarie" },
  { key: "equity", label: "Patrimonio netto", hint: "Unità monetarie" },
] as const;

const DEMO_INPUT: WaccInput = {
  riskFreeBp: 350,
  equityRiskPremiumBp: 550,
  countryRiskPremiumBp: 150,
  betaUnleveredMilli: 900,
  creditSpreadBp: 200,
  taxRateBp: 2400,
  debt: 400,
  equity: 600,
};

function WaccModule() {
  const [form, setForm] = useState<Record<keyof WaccInput, string>>(() => ({
    riskFreeBp: String(DEMO_INPUT.riskFreeBp),
    equityRiskPremiumBp: String(DEMO_INPUT.equityRiskPremiumBp),
    countryRiskPremiumBp: String(DEMO_INPUT.countryRiskPremiumBp),
    betaUnleveredMilli: String(DEMO_INPUT.betaUnleveredMilli),
    creditSpreadBp: String(DEMO_INPUT.creditSpreadBp),
    taxRateBp: String(DEMO_INPUT.taxRateBp),
    debt: String(DEMO_INPUT.debt),
    equity: String(DEMO_INPUT.equity),
  }));

  const outcome = useMemo(() => {
    const parsed = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, Number(value.replace(",", "."))]),
    ) as unknown as WaccInput;
    return computeWacc(parsed);
  }, [form]);

  const item = getItem("valora-wacc");
  const source = item ? getSource(item.sourceId) : null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
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
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Composizione del costo del capitale a partire dalle sue componenti. Gli importi sono espressi
        in punti base per evitare errori di arrotondamento.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-gold bg-gold/10 px-2.5 py-1 font-medium text-gold-foreground">
          DEMO
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
          Modello {item?.version ?? "non dichiarato"}
        </span>
        {item?.checksum ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
            Checksum {item.checksum}
          </span>
        ) : null}
      </div>

      <form className="mt-8 grid gap-4 rounded-lg border border-rule bg-card p-5 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        {FIELDS.map((field) => (
          <div key={field.key} className="min-w-0">
            <label className="block text-sm font-medium" htmlFor={`wacc-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`wacc-${field.key}`}
              type="number"
              inputMode="decimal"
              min={0}
              value={form[field.key]}
              placeholder="0…"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, [field.key]: event.target.value }))
              }
              className="mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </form>

      <section aria-labelledby="risultato" className="mt-10">
        <h2 id="risultato" className="font-serif text-2xl">
          Risultato
        </h2>
        <div aria-live="polite" className="mt-4">
          {outcome.status === "blocked" ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <span className="min-w-0">{outcome.message}</span>
            </p>
          ) : (
            <div className="rounded-lg border border-rule bg-card p-5">
              <p className="text-sm text-muted-foreground">WACC</p>
              <p className="font-serif text-4xl">{formatBp(outcome.waccBp)}</p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {outcome.steps.map((step) => (
                  <div key={step.label} className="min-w-0 rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">{step.label}</dt>
                    <dd className="mt-1 font-serif text-lg">{step.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Beta levered impiegato: {formatMilli(outcome.betaLeveredMilli)} · modello{" "}
                {outcome.modelVersion}
              </p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="derivazione" className="mt-12">
        <h2 id="derivazione" className="font-serif text-2xl">
          Formula, dataset, fonte, versione
        </h2>
        <ol className="mt-4 space-y-3">
          {(item?.formulaChain ?? []).map((formula, index) => (
            <li key={formula} className="min-w-0 rounded-lg border border-rule bg-card p-4 text-sm">
              <span className="mr-2 text-xs text-muted-foreground">Passaggio {index + 1}</span>
              <span className="break-words">{formula}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-lg border border-rule bg-muted/40 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Dataset:</span> valori dimostrativi sintetici,
            versione {item?.version ?? "non dichiarata"}.
          </p>
          <p className="mt-1 break-words">
            <span className="text-muted-foreground">Fonte metodologica:</span>{" "}
            {source?.name ?? "non registrata"} — {source?.attribution ?? "attribuzione assente"}.
          </p>
          {source ? (
            <a
              href={source.officialUrl}
              target="_blank"
              rel="noreferrer noopener external"
              className="mt-2 inline-flex items-center gap-1 break-all text-petrol underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sito ufficiale della fonte
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </section>

      <p className="mt-12 rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground">
        Il risultato è ottenuto da valori sintetici a scopo dimostrativo e non costituisce consulenza
        fiscale, finanziaria o di valutazione. Prima di qualsiasi impiego professionale, parametri e
        fonti vanno verificati e approvati da un professionista.
      </p>
    </div>
  );
}
