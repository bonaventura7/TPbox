import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/company-finder/germany-smoke")({
  server: {
    handlers: {
      GET: async () => {
        const { searchUrAccounting } = await import("@/lib/company-finder/sources/bilanci/ur-de");
        const result = await searchUrAccounting("ORI MARTIN GMBH", 45000);
        return Response.json({
          ok: result.ok,
          available: result.data?.available ?? false,
          source: result.data?.source,
          documentTitle: result.data?.documentTitle,
          documentUrl: result.data?.documentUrl,
          note: result.data?.note,
          error: result.error,
        });
      },
    },
  },
});
