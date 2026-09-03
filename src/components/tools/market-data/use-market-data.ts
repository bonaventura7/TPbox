/**
 * Caricamento dei dati di mercato in due tempi.
 *
 * Prima richiesta senza rete (`live=0`): risponde immediatamente con il dataset
 * congelato, cosi' lo strumento e' usabile subito e in modo deterministico.
 * Seconda richiesta con le fonti attive: quando arriva sostituisce i valori e
 * gli stati passano da «dataset» a «dal vivo». Se le fonti non rispondono resta
 * il dataset, dichiarato come tale.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { MarketBundle } from "@/lib/market-data/types";

async function fetchBundle(date: string, live: boolean): Promise<MarketBundle> {
  const response = await fetch(`/api/market-data?date=${date}&live=${live ? "1" : "0"}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `richiesta non riuscita (HTTP ${response.status})`);
  }
  return (await response.json()) as MarketBundle;
}

export interface MarketDataState {
  readonly bundle: MarketBundle | null;
  readonly phase: "loading" | "snapshot" | "live" | "error";
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

const isBrowser = typeof document !== "undefined";

export function useMarketData(date: string): MarketDataState {
  const client = useQueryClient();

  const snapshot = useQuery({
    queryKey: ["market-data", date, "snapshot"],
    queryFn: () => fetchBundle(date, false),
    enabled: isBrowser,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  const live = useQuery({
    queryKey: ["market-data", date, "live"],
    queryFn: () => fetchBundle(date, true),
    enabled: isBrowser,
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["market-data", date, "live"] });
  }, [client, date]);

  const bundle = live.data ?? snapshot.data ?? null;
  const error =
    live.error instanceof Error && snapshot.error instanceof Error
      ? snapshot.error.message
      : snapshot.error instanceof Error
        ? snapshot.error.message
        : null;

  const phase: MarketDataState["phase"] =
    bundle === null ? (error === null ? "loading" : "error") : live.data ? "live" : "snapshot";

  return {
    bundle,
    phase,
    refreshing: live.isFetching,
    error,
    refresh,
  };
}
