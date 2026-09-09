import { createFileRoute } from "@tanstack/react-router";

import { downloadGermanyPublicBalanceCsv } from "@/lib/company-finder/sources/bilanci/germany-public-balance";

function safeFilename(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "bilancio-germania";
}

export const Route = createFileRoute("/api/company-finder/germany-public-balance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const company = url.searchParams.get("company")?.trim();
        const yearParam = url.searchParams.get("year")?.trim();

        if (!company) {
          return Response.json({ error: "company mancante" }, { status: 400 });
        }

        const year = yearParam ? Number(yearParam) : undefined;
        if (yearParam && (year === undefined || !Number.isInteger(year) || year < 2000 || year > 2100)) {
          return Response.json({ error: "anno non valido" }, { status: 400 });
        }

        const result = await downloadGermanyPublicBalanceCsv(company, year);
        if (!result) {
          return Response.json({ error: "bilancio non disponibile" }, { status: 404 });
        }

        return new Response(result.csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeFilename(company)}-${result.year}.csv"`,
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
