// Endpoint interno per il download dei bilanci: il client passa solo un token
// opaco, l'URL della fonte non lascia mai il server. Tutta la logica di
// allowlist, SSRF, retry, circuit breaker e validazione sta nel resolver.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/company-finder/financial-document")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleFinancialDocumentRequest } =
          await import("@/lib/company-finder/document-resolver.server");
        return handleFinancialDocumentRequest(request);
      },
    },
  },
});
