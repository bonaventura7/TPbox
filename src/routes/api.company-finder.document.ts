import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotta del proxy documenti: la logica sta in
 * `lib/company-finder/document-proxy.server`, cosi' resta collaudabile
 * senza montare il router.
 */
export const Route = createFileRoute("/api/company-finder/document")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { handleDocumentRequest } =
          await import("@/lib/company-finder/document-proxy.server");
        return handleDocumentRequest(request);
      },
    },
  },
});
