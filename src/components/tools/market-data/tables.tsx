/**
 * Tabelle dei dati di mercato, condivise dal cruscotto e dal converter.
 * Numeri allineati a destra con cifre tabellari, serie in chiaro e link alla
 * fonte su ogni riga: una riga di tabella deve bastare per citare il dato.
 */
import { ExternalLink } from "lucide-react";

import { metricById } from "@/lib/market-data/registry";
import { isResolved, type MarketEntry } from "@/lib/market-data/types";
import type { CountryEntry } from "@/lib/market-data/types";

import { formatNumber, formatRate } from "./format";
import { EntryStatusBadge } from "./status";

function SourceLink({ entry }: { readonly entry: MarketEntry }) {
  return (
    <a
      href={entry.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-petrol underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      title={`Apri la serie ${entry.series} sulla fonte`}
    >
      <span className="font-mono text-[11px]">{entry.series}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

const CELL = "px-3 py-2 align-top";
const HEAD = "px-3 py-2 text-left font-medium text-muted-foreground";

export function SkeletonRows({
  rows,
  columns,
}: {
  readonly rows: number;
  readonly columns: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-rule">
          {Array.from({ length: columns }, (_, cellIndex) => (
            <td key={cellIndex} className={CELL}>
              <span className="block h-3 w-full max-w-28 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function FxTable({
  fx,
  loading,
}: {
  readonly fx: Readonly<Record<string, MarketEntry>> | null;
  readonly loading: boolean;
}) {
  const pairs = fx === null ? [] : Object.keys(fx).sort();
  return (
    <div className="overflow-x-auto rounded-lg border border-rule">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Cambi di riferimento della Banca centrale europea, con data e stato del dato
        </caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className={HEAD}>
              Coppia
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Valore
            </th>
            <th scope="col" className={HEAD}>
              As of
            </th>
            <th scope="col" className={HEAD}>
              Serie
            </th>
            <th scope="col" className={HEAD}>
              Stato
            </th>
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={6} columns={5} />}
          {!loading &&
            pairs.map((pair) => {
              const entry = fx?.[pair];
              if (entry === undefined) return null;
              return (
                <tr key={pair} className="border-t border-rule">
                  <th scope="row" className={`${CELL} text-left font-medium`}>
                    {pair}
                  </th>
                  <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>
                    {isResolved(entry) ? formatNumber(entry.value, 4, 6) : "—"}
                  </td>
                  <td className={`${CELL} whitespace-nowrap tabular-nums text-muted-foreground`}>
                    {isResolved(entry) ? entry.asOf : "—"}
                  </td>
                  <td className={CELL}>
                    <SourceLink entry={entry} />
                  </td>
                  <td className={CELL}>
                    <EntryStatusBadge entry={entry} />
                    {!isResolved(entry) && (
                      <span className="mt-1 block max-w-xs text-xs text-muted-foreground">
                        {entry.reason}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export function RatesTable({
  rates,
  ids,
  loading,
}: {
  readonly rates: Readonly<Record<string, MarketEntry>> | null;
  readonly ids: readonly string[];
  readonly loading: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule">
      <table className="w-full text-sm">
        <caption className="sr-only">Tassi di riferimento con data, serie e stato del dato</caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className={HEAD}>
              Metrica
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Valore
            </th>
            <th scope="col" className={HEAD}>
              As of
            </th>
            <th scope="col" className={HEAD}>
              Serie
            </th>
            <th scope="col" className={HEAD}>
              Stato
            </th>
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={8} columns={5} />}
          {!loading &&
            ids.map((id) => {
              const entry = rates?.[id];
              const metric = metricById(id);
              if (entry === undefined || metric === null) return null;
              return (
                <tr key={id} className="border-t border-rule">
                  <th scope="row" className={`${CELL} max-w-sm text-left font-medium`}>
                    {metric.label}
                  </th>
                  <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>
                    {isResolved(entry) ? formatRate(entry.value) : "—"}
                  </td>
                  <td className={`${CELL} whitespace-nowrap tabular-nums text-muted-foreground`}>
                    {isResolved(entry) ? entry.asOf : "—"}
                  </td>
                  <td className={CELL}>
                    <SourceLink entry={entry} />
                    {!metric.verified && (
                      <span
                        className="ml-1 cursor-help text-muted-foreground"
                        title="Chiave della serie non verificata in fase di sviluppo."
                      >
                        *
                      </span>
                    )}
                  </td>
                  <td className={CELL}>
                    <EntryStatusBadge entry={entry} />
                    {!isResolved(entry) && (
                      <span className="mt-1 block max-w-xs text-xs text-muted-foreground">
                        {entry.reason}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      {!loading && ids.some((id) => metricById(id)?.verified === false) && (
        <p className="border-t border-rule bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          * chiave della serie non verificata in fase di sviluppo: se non risponde la metrica
          compare come non disponibile, senza valori stimati.
        </p>
      )}
    </div>
  );
}

export function CountryRiskPanel({ entry }: { readonly entry: CountryEntry | null }) {
  if (entry === null) {
    return (
      <div className="rounded-lg border border-rule p-4">
        <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (entry.status !== "OK") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">Country risk non disponibile</p>
        <p className="mt-1 text-muted-foreground">{entry.reason}</p>
      </div>
    );
  }
  const data = entry.data;
  const items: readonly { readonly label: string; readonly value: string }[] = [
    { label: "Rating Moody's", value: data.ratingMoodys },
    { label: "Default spread", value: formatRate(data.defaultSpread * 100) },
    { label: "Equity risk premium totale", value: formatRate(data.totalErp * 100) },
    { label: "Country risk premium", value: formatRate(data.countryRiskPremium * 100) },
    {
      label: "CDS 10 anni",
      value: data.cds10y === null ? "—" : `${formatNumber(data.cds10y * 10_000, 0, 0)} bp`,
    },
  ];
  return (
    <div className="rounded-lg border border-rule bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl">Italia</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">aggiornamento {entry.asOf}</span>
          <EntryStatusBadge entry={entry} />
        </div>
      </div>
      <dl className="mt-4 divide-y divide-rule text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="tabular-nums font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Fonte:{" "}
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-petrol underline-offset-2 hover:underline"
        >
          Damodaran, NYU Stern — ctryprem.xlsx
        </a>
        . Il file viene aggiornato una volta l&apos;anno, a gennaio.
      </p>
    </div>
  );
}
