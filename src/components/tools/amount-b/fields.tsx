/**
 * Amount B – Campi di input riutilizzabili del wizard.
 *
 * Sono componenti volutamente semplici: input nativi con etichette collegate,
 * pensati per l'inserimento rapido di serie numeriche su più esercizi.
 */

import { type ReactNode, useId } from "react";

interface FieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly children: (id: string) => ReactNode;
}

/** Etichetta, campo e nota esplicativa. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background";

interface AmountInputProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel?: string;
}

/** Campo numerico con tastierino decimale su mobile. */
export function AmountInput({ id, value, onChange, ariaLabel }: AmountInputProps) {
  return (
    <input
      id={id}
      inputMode="decimal"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

interface YearSeriesProps {
  readonly label: string;
  readonly hint?: string;
  readonly labels: readonly string[];
  readonly values: readonly string[];
  readonly onChange: (index: number, value: string) => void;
}

/**
 * Riga di input per una voce su più esercizi.
 *
 * Le intestazioni degli esercizi si mostrano una sola volta sopra la griglia,
 * quindi ogni campo porta la propria etichetta accessibile.
 */
export function YearSeries({ label, hint, labels, values, onChange }: YearSeriesProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start sm:gap-4">
      <div className="pt-2">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      >
        {labels.map((yearLabel, i) => (
          <AmountInput
            key={yearLabel}
            value={values[i] ?? ""}
            ariaLabel={`${label}, esercizio ${yearLabel}`}
            onChange={(v) => onChange(i, v)}
          />
        ))}
      </div>
    </div>
  );
}

/** Intestazione delle colonne di una griglia di esercizi. */
export function YearHeader({ labels }: { readonly labels: readonly string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
      <div />
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      >
        {labels.map((l) => (
          <span
            key={l}
            aria-hidden="true"
            className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            esercizio {l}
          </span>
        ))}
      </div>
    </div>
  );
}
