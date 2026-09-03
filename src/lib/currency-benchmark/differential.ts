/**
 * Costruzione del differenziale fra i tassi di riferimento delle due valute a
 * partire dai dati di mercato risolti.
 *
 * La copertura e' dichiarata nel registry: dove non esiste una serie gratuita
 * per la valuta e il tenor richiesti il differenziale non viene costruito e il
 * motivo torna all'interfaccia. Nessun ripiego su un tenor diverso.
 */
import { metricById, referenceRateId, type TenorId } from "../market-data/registry";
import { isResolved, type MarketBundle } from "../market-data/types";
import type { Differential, RateLeg } from "./types";

export type DifferentialOutcome =
  | { readonly ok: true; readonly differential: Differential }
  | { readonly ok: false; readonly reason: string };

function coverageGap(currency: string, tenor: TenorId): string | null {
  return referenceRateId(currency, tenor) === null
    ? `per ${currency} il registry non ha un tasso di riferimento a ${tenor}`
    : null;
}

function legFor(bundle: MarketBundle, currency: string, tenor: TenorId): RateLeg | string {
  const metricId = referenceRateId(currency, tenor);
  if (metricId === null) {
    return `per ${currency} il registry non ha un tasso di riferimento a ${tenor}`;
  }
  const entry = bundle.rates[metricId];
  const metric = metricById(metricId);
  if (entry === undefined || metric === null) {
    return `la serie ${metricId} non è nei dati di mercato caricati`;
  }
  if (!isResolved(entry)) {
    return `${metric.label}: ${entry.reason}`;
  }
  return {
    currency,
    metricId,
    label: metric.label,
    value: entry.value,
    asOf: entry.asOf,
    source: entry.source,
    series: entry.series,
    sourceUrl: entry.sourceUrl,
    cacheStatus: entry.cacheStatus,
    verified: metric.verified,
  };
}

export function buildDifferential(
  bundle: MarketBundle,
  sourceCurrency: string,
  targetCurrency: string,
  tenor: TenorId,
): DifferentialOutcome {
  // La copertura si annuncia prima dei problemi di fonte: se la valuta non ha
  // un tasso di riferimento a quel tenor, e' quella l'informazione utile.
  const gap = coverageGap(sourceCurrency, tenor) ?? coverageGap(targetCurrency, tenor);
  if (gap !== null) return { ok: false, reason: gap };

  const sourceLeg = legFor(bundle, sourceCurrency, tenor);
  if (typeof sourceLeg === "string") return { ok: false, reason: sourceLeg };
  const targetLeg = legFor(bundle, targetCurrency, tenor);
  if (typeof targetLeg === "string") return { ok: false, reason: targetLeg };

  return {
    ok: true,
    differential: {
      sourceLeg,
      targetLeg,
      deltaBp: Number(((targetLeg.value - sourceLeg.value) * 100).toFixed(6)),
      asOfMismatch: sourceLeg.asOf !== targetLeg.asOf,
    },
  };
}
