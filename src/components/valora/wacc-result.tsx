/**
 * Presentazione del risultato WACC: nessun calcolo qui, solo formattazione.
 */

import { AlertTriangle, Info } from "lucide-react";

import type { WaccOutcome } from "../../lib/valora/wacc/model";
import {
  formatAmount,
  formatBeta,
  formatBpAsPercent,
  formatMultiple,
  formatRatio,
  formatTimestamp,
} from "../../lib/valora/wacc/format";

export function WaccResult({ outcome }: { readonly outcome: WaccOutcome }) {
  if (outcome.outcome === "blocked") {
    return (
      <div
        role="alert"
        className="mt-6 min-w-0 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
      >
        <p className="flex items-start gap-2 font-medium">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Calcolo bloccato: nessun risultato viene prodotto con parametri non validi.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          {outcome.errors.map((error) => (
            <li key={`${error.field}-${error.code}`} className="break-words">
              {error.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { breakdown: b, inputSnapshot: i } = outcome;

  return (
    <div className="mt-6 space-y-6">
      <div className="min-w-0 rounded-lg border border-petrol/40 bg-muted/40 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">WACC</p>
        <p className="font-serif text-4xl tracking-tight">{formatBpAsPercent(outcome.waccBp)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Calcolato il {formatTimestamp(outcome.calculatedAt)} · motore {outcome.engineVersion} ·
          metodologia {outcome.methodologyVersion}
        </p>
      </div>

      {outcome.warnings.length > 0 ? (
        <ul className="min-w-0 space-y-2 rounded-lg border border-rule bg-card p-4 text-sm">
          {outcome.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-petrol" aria-hidden="true" />
              <span className="min-w-0 break-words">{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="min-w-0 space-y-2 rounded-lg border border-rule bg-card p-4 text-sm">
        <Row label="Beta levered" value={formatBeta(b.betaLeveredMilli)} />
        <Row label="Costo dell'equity (Ke)" value={formatBpAsPercent(b.costOfEquityBp)} />
        <Row label="Costo del debito lordo" value={formatBpAsPercent(b.costOfDebtGrossBp)} />
        <Row
          label="Costo del debito al netto delle imposte"
          value={formatBpAsPercent(b.costOfDebtNetBp)}
        />
        <Row label="Peso dell'equity (wE)" value={formatRatio(b.equityWeight)} />
        <Row label="Peso del debito (wD)" value={formatRatio(b.debtWeight)} />
        <Row label="Rapporto D/E" value={formatMultiple(b.debtToEquity)} />
        <Row
          label="Premio per il rischio paese usato"
          value={`${formatBpAsPercent(b.countryRiskPremiumBp)}${
            b.countryRiskPremiumOmitted ? " (non inserito: zero esplicito)" : ""
          }`}
        />
      </dl>

      <section aria-labelledby="passaggi" className="min-w-0">
        <h3 id="passaggi" className="font-serif text-xl">
          Passaggi del calcolo
        </h3>
        <ol className="mt-3 space-y-2">
          {outcome.steps.map((step, index) => (
            <li
              key={step.label}
              className="min-w-0 rounded-lg border border-rule bg-card p-3 text-sm"
            >
              <span className="mr-2 text-xs text-muted-foreground">Passaggio {index + 1}</span>
              <span className="break-words">
                {step.label}: {step.expression}
                {step.valueBp === null ? "" : ` = ${formatBpAsPercent(step.valueBp)}`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <dl className="min-w-0 space-y-2 rounded-lg border border-rule bg-muted/30 p-4 text-xs">
        <Row label="Tasso privo di rischio inserito" value={formatBpAsPercent(i.riskFreeBp)} />
        <Row
          label="Premio rischio azionario inserito"
          value={formatBpAsPercent(i.equityRiskPremiumBp)}
        />
        <Row label="Beta unlevered inserito" value={formatBeta(i.betaUnleveredMilli)} />
        <Row label="Spread creditizio inserito" value={formatBpAsPercent(i.creditSpreadBp)} />
        <Row label="Aliquota fiscale inserita" value={formatBpAsPercent(i.taxRateBp)} />
        <Row label="Debito inserito" value={formatAmount(i.debt)} />
        <Row label="Equity inserito" value={formatAmount(i.equity)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
