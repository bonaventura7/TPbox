/**
 * Handler di `/api/market-data`.
 *
 * Validazione stretta della data richiesta, un solo giro di chiamate alle fonti
 * con budget di tempo, risposta con provenienza completa. La risposta e'
 * memorizzabile dalla cache di frontiera per un quarto d'ora: i cambi di
 * riferimento BCE cambiano una volta al giorno e le serie FRED una volta al
 * giorno lavorativo, quindi ricalcolare a ogni visita costerebbe tempo senza
 * dare un dato piu' recente.
 */
import { isIsoDate, todayIso } from "./as-of";
import { buildMarketBundle, DEFAULT_BUDGET_MS } from "./resolve.server";

const CACHE_CONTROL = "public, max-age=60, s-maxage=900, stale-while-revalidate=86400";

function json(body: unknown, status: number, cacheable: boolean): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? CACHE_CONTROL : "no-store",
    },
  });
}

export async function handleMarketDataRequest(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const requested = params.get("date");
  const date = requested === null || requested === "" ? todayIso() : requested;

  if (!isIsoDate(date)) {
    return json({ error: "parametro date non valido: attesa una data YYYY-MM-DD" }, 400, false);
  }
  if (date < "1999-01-04") {
    return json(
      { error: "data anteriore all'introduzione dell'euro: nessun cambio di riferimento BCE" },
      400,
      false,
    );
  }

  const live = params.get("live") !== "0";

  try {
    const bundle = await buildMarketBundle({ date, live, budgetMs: DEFAULT_BUDGET_MS });
    return json(bundle, 200, true);
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "errore inatteso";
    return json({ error: `dati di mercato non disponibili: ${message}` }, 502, false);
  }
}
