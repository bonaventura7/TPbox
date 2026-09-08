import { createFileRoute } from "@tanstack/react-router";

import { buildGermanyPublicBalanceCsv } from "@/lib/company-finder/sources/bilanci/germany-public-balance";

const ALLOWED_HOSTS = new Set(["www.unternehmen24.info", "unternehmen24.info"]);

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
        const sourceUrl = url.searchParams.get("sourceUrl")?.trim();
        const company = url.searchParams.get("company")?.trim();

        if (!sourceUrl || !company) {
          return Response.json({ error: "company/sourceUrl mancanti" }, { status: 400 });
        }

        let source: URL;
        try {
          source = new URL(sourceUrl);
        } catch {
          return Response.json({ error: "sourceUrl non valido" }, { status: 400 });
        }

        if (source.protocol !== "https:" || !ALLOWED_HOSTS.has(source.hostname.toLowerCase())) {
          return Response.json({ error: "fonte non autorizzata" }, { status: 403 });
        }

        const result = await buildGermanyPublicBalanceCsv(source.toString(), company);
        if (!result) {
          return Response.json({ error: "bilancio non disponibile dalla fonte pubblica" }, { status: 404 });
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
