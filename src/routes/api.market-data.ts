import { createFileRoute } from "@tanstack/react-router";

/**
 * Dati di mercato per gli strumenti del portale: cambi di riferimento BCE,
 * tassi BCE e FRED, country risk premium Damodaran.
 *
 * Il browser non interroga le fonti: la richiesta parte da qui, lato server,
 * come per il proxy documenti del Company Finder. La logica sta in
 * `lib/market-data/handler.server` per restare collaudabile senza router.
 *
 * GET /api/market-data?date=YYYY-MM-DD&live=0|1
 */
export const Route = createFileRoute("/api/market-data")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { handleMarketDataRequest } = await import("@/lib/market-data/handler.server");
        return handleMarketDataRequest(request);
      },
    },
  },
});
