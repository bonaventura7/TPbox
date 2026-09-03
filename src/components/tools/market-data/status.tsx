/**
 * Vocabolario visivo dello stato di un dato di mercato, condiviso da tutti gli
 * strumenti: lo stesso stato ha sempre la stessa forma e lo stesso colore.
 */
import type { CacheStatus } from "@/lib/market-data/types";

import { statusKeyOf, type StatusKey } from "./format";

/** Qualunque voce che dichiari il proprio stato: dato di mercato o country risk. */
export type StatusBearing =
  { readonly status: "OK"; readonly cacheStatus: CacheStatus } | { readonly status: "UNAVAILABLE" };

const STATUS: Readonly<
  Record<StatusKey, { readonly label: string; readonly className: string; readonly title: string }>
> = {
  LIVE: {
    label: "dal vivo",
    className: "border-petrol/50 bg-petrol/10 text-petrol",
    title: "Valore scaricato dalla fonte alla data richiesta.",
  },
  CACHED: {
    label: "dataset",
    className: "border-border bg-muted text-foreground",
    title: "Valore dal dataset congelato nel repository, entro la finestra di validità.",
  },
  CACHED_STALE: {
    label: "da verificare",
    className: "border-gold bg-gold/15 text-gold-foreground",
    title:
      "Valore dal dataset congelato ma distante dalla data richiesta: da verificare alla fonte prima dell'uso.",
  },
  UNAVAILABLE: {
    label: "non disponibile",
    className: "border-destructive/40 bg-destructive/5 text-destructive",
    title: "Fonte non risolta: nessun valore, nessuna stima.",
  },
};

export function DataStatusBadge({ status }: { readonly status: StatusKey }) {
  const style = STATUS[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.className}`}
      title={style.title}
    >
      {style.label}
    </span>
  );
}

export function EntryStatusBadge({ entry }: { readonly entry: StatusBearing }) {
  return <DataStatusBadge status={statusKeyOf(entry)} />;
}
