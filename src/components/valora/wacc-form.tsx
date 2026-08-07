/**
 * Modulo di inserimento manuale dei parametri WACC.
 * Tutti i valori sono digitati dall'utente: nessun dato di mercato precompilato,
 * nessun fetch, nessuna persistenza.
 */

import { useId, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { WaccInputHelp } from "./wacc-input-help";
import { computeWacc } from "../../lib/valora/wacc/engine";
import { validateWaccInput, type RawWaccInput } from "../../lib/valora/wacc/validation";
import type { WaccField, WaccOutcome } from "../../lib/valora/wacc/model";

const EMPTY: RawWaccInput = {
  riskFreePct: "",
  equityRiskPremiumPct: "",
  countryRiskPremiumPct: "",
  betaUnlevered: "",
  creditSpreadPct: "",
  taxRatePct: "",
  debt: "",
  equity: "",
};

type FieldErrors = Partial<Record<WaccField | "form", string>>;

interface FieldConfig {
  readonly name: keyof RawWaccInput;
  readonly field: WaccField;
  readonly label: string;
  readonly unit: string;
  readonly help: string;
}

const RISK_FIELDS: readonly FieldConfig[] = [
  {
    name: "riskFreePct",
    field: "riskFreeBp",
    label: "Tasso privo di rischio",
    unit: "%",
    help: "Rendimento di riferimento privo di rischio scelto dall'utente.",
  },
  {
    name: "equityRiskPremiumPct",
    field: "equityRiskPremiumBp",
    label: "Premio per il rischio azionario",
    unit: "%",
    help: "Premio richiesto sul mercato azionario rispetto al tasso privo di rischio.",
  },
  {
    name: "countryRiskPremiumPct",
    field: "countryRiskPremiumBp",
    label: "Premio per il rischio paese (facoltativo)",
    unit: "%",
    help: "Se lasciato vuoto viene usato il valore esplicito 0, indicato nel risultato.",
  },
  {
    name: "betaUnlevered",
    field: "betaUnleveredMilli",
    label: "Beta unlevered",
    unit: "indice",
    help: "Beta senza effetto della leva finanziaria, ad esempio 0,9.",
  },
];

const DEBT_FIELDS: readonly FieldConfig[] = [
  {
    name: "creditSpreadPct",
    field: "creditSpreadBp",
    label: "Spread creditizio",
    unit: "%",
    help: "Maggiorazione sul tasso privo di rischio applicata al debito.",
  },
  {
    name: "taxRatePct",
    field: "taxRateBp",
    label: "Aliquota fiscale",
    unit: "%",
    help: "Ammessi solo valori da 0 a 100.",
  },
  {
    name: "debt",
    field: "debt",
    label: "Debito finanziario (D)",
    unit: "valuta",
    help: "Zero o positivo, nella stessa unità dell'equity.",
  },
  {
    name: "equity",
    field: "equity",
    label: "Equity (E)",
    unit: "valuta",
    help: "Maggiore di zero, nella stessa unità del debito.",
  },
];

export function WaccForm({
  onResult,
}: {
  readonly onResult: (outcome: WaccOutcome | null) => void;
}) {
  const [values, setValues] = useState<RawWaccInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string>("");
  const prefix = useId();
  const firstInvalid = useRef<HTMLInputElement | null>(null);

  const fieldId = (name: string) => `${prefix}-${name}`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    firstInvalid.current = null;
    const validation = validateWaccInput(values);
    if (!validation.ok) {
      const next: FieldErrors = {};
      for (const error of validation.errors) {
        if (next[error.field] === undefined) next[error.field] = error.message;
      }
      setErrors(next);
      onResult(null);
      setStatus(
        `Calcolo non eseguito: ${validation.errors.length} campo/i da correggere prima di procedere.`,
      );
      const firstField = validation.errors.find((error) => error.field !== "form");
      if (firstField) {
        const config = [...RISK_FIELDS, ...DEBT_FIELDS].find((c) => c.field === firstField.field);
        if (config) document.getElementById(fieldId(config.name))?.focus();
      }
      return;
    }
    setErrors({});
    const outcome = computeWacc(validation.input, new Date().toISOString());
    onResult(outcome);
    setStatus(
      outcome.outcome === "ok"
        ? "Calcolo eseguito: il risultato è disponibile più sotto."
        : "Calcolo bloccato: verifica i parametri inseriti.",
    );
  }

  function handleReset() {
    setValues(EMPTY);
    setErrors({});
    onResult(null);
    setStatus("Modulo ripristinato: tutti i campi sono vuoti.");
  }

  function renderField(config: FieldConfig) {
    const id = fieldId(config.name);
    const helpId = `${id}-help`;
    const errorId = `${id}-error`;
    const error = errors[config.field];
    return (
      <div key={config.name} className="min-w-0">
        <Label htmlFor={id} className="text-sm">
          {config.label}{" "}
          <span className="text-xs font-normal text-muted-foreground">({config.unit})</span>
        </Label>
        <Input
          id={id}
          name={config.name}
          inputMode="decimal"
          autoComplete="off"
          value={values[config.name]}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${helpId}` : helpId}
          onChange={(event) =>
            setValues((current) => ({ ...current, [config.name]: event.target.value }))
          }
          className="mt-1.5"
        />
        <div className="mt-1 space-y-1">
          {error ? (
            <p id={errorId} className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <WaccInputHelp id={helpId}>{config.help}</WaccInputHelp>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-10">
      <fieldset className="min-w-0 rounded-lg border border-rule bg-card p-4 sm:p-6">
        <legend className="px-1 font-serif text-xl">Rischio e rendimento atteso</legend>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">{RISK_FIELDS.map(renderField)}</div>
      </fieldset>

      <fieldset className="min-w-0 rounded-lg border border-rule bg-card p-4 sm:p-6">
        <legend className="px-1 font-serif text-xl">Debito e struttura finanziaria</legend>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">{DEBT_FIELDS.map(renderField)}</div>
        {errors.form ? <p className="mt-4 text-xs text-destructive">{errors.form}</p> : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Calcola WACC</Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          Ripristina
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </form>
  );
}
