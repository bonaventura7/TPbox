/**
 * Spostamento del range.
 *
 * Il risultato di un benchmark in valuta e' il range interquartile: questa
 * figura mostra dove stava e dove finisce dopo la conversione, sulla stessa
 * scala. La banda e' Q1-Q3, il segno verticale la mediana, la linea sottile
 * l'intervallo minimo-massimo. I numeri stanno nella tabella accanto: la figura
 * e' una lettura d'insieme, non la fonte del dato.
 */
import type { RangeStats } from "@/lib/currency-benchmark/types";

interface Domain {
  readonly from: number;
  readonly to: number;
}

function domainOf(populations: readonly (RangeStats | null)[]): Domain | null {
  const values = populations.filter((stats): stats is RangeStats => stats !== null);
  if (values.length === 0) return null;
  const min = Math.min(...values.map((stats) => stats.min));
  const max = Math.max(...values.map((stats) => stats.max));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) return { from: min - 0.5, to: max + 0.5 };
  const padding = (max - min) * 0.06;
  return { from: min - padding, to: max + padding };
}

function position(value: number, domain: Domain): number {
  const span = domain.to - domain.from;
  if (span <= 0) return 50;
  return ((value - domain.from) / span) * 100;
}

function Track({
  stats,
  domain,
  tone,
}: {
  readonly stats: RangeStats | null;
  readonly domain: Domain;
  readonly tone: "source" | "target";
}) {
  if (stats === null) {
    return <div className="relative h-7 rounded-sm border border-dashed border-rule" />;
  }
  const left = position(stats.q1, domain);
  const width = Math.max(position(stats.q3, domain) - left, 0.6);
  const from = position(stats.min, domain);
  const to = position(stats.max, domain);
  const median = position(stats.median, domain);
  const band =
    tone === "target" ? "border-petrol bg-petrol/20" : "border-border bg-muted-foreground/15";
  const stroke = tone === "target" ? "bg-petrol" : "bg-muted-foreground";
  const motion = "transition-[left,width] duration-200 ease-out motion-reduce:transition-none";

  return (
    <div className="relative h-7">
      <span
        className={`absolute top-1/2 h-px -translate-y-1/2 ${stroke} ${motion}`}
        style={{ left: `${from}%`, width: `${Math.max(to - from, 0.4)}%` }}
      />
      {[from, to].map((edge, index) => (
        <span
          key={index}
          className={`absolute top-1/2 h-3 w-px -translate-y-1/2 ${stroke} ${motion}`}
          style={{ left: `${edge}%` }}
        />
      ))}
      <span
        className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border ${band} ${motion}`}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <span
        className={`absolute top-1/2 h-5 w-0.5 -translate-y-1/2 ${stroke} ${motion}`}
        style={{ left: `${median}%` }}
      />
    </div>
  );
}

export function RangeShift({
  source,
  target,
  sourceLabel,
  targetLabel,
}: {
  readonly source: RangeStats | null;
  readonly target: RangeStats | null;
  readonly sourceLabel: string;
  readonly targetLabel: string;
}) {
  const domain = domainOf([source, target]);
  if (domain === null) return null;
  return (
    <figure aria-hidden="true" className="mt-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">{sourceLabel}</span>
          <div className="flex-1">
            <Track stats={source} domain={domain} tone="source" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs font-medium text-petrol">{targetLabel}</span>
          <div className="flex-1">
            <Track stats={target} domain={domain} tone="target" />
          </div>
        </div>
      </div>
      <figcaption className="mt-2 pl-17 text-xs text-muted-foreground">
        Banda: primo–terzo quartile. Segno verticale: mediana. Linea sottile: minimo–massimo.
      </figcaption>
    </figure>
  );
}
