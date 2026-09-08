import { createFileRoute } from "@tanstack/react-router";

function envKey(): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.OPENREGISTER_API_KEY?.trim();
}

export const Route = createFileRoute("/api/company-finder/document")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const company = url.searchParams.get("company")?.trim();
        const yearValue = url.searchParams.get("year")?.trim();
        if (!company) {
          return new Response(JSON.stringify({ error: "società mancante" }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        const year = Number(yearValue);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          return new Response(JSON.stringify({ error: "esercizio non valido" }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
          });
        }

        const download = url.searchParams.get("download") === "1";
        const key = envKey();

        if (key) {
          const { fetchOpenRegisterAnnualReport } = await import("@/lib/company-finder/sources/bilanci/openregister-de");
          const result = await fetchOpenRegisterAnnualReport(company, year, 20000);
          if (result.ok && result.html) {
            return new Response(result.html, {
              status: 200,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${result.filename ?? `bilancio-${year}.html`}"`,
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
        }

        const { findOfficialUrPublication } = await import("@/lib/company-finder/sources/bilanci/ur-de");
        const fallback = await findOfficialUrPublication(company, year, 30000);
        if (!fallback.ok || !fallback.document?.url) {
          return new Response(JSON.stringify({ error: fallback.error ?? `bilancio ${year} non disponibile` }), {
            status: 502,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
          });
        }

        const { handleDocumentRequest } = await import("@/lib/company-finder/document-proxy.server");
        const internalRequest = new Request(
          new URL(
            `/api/company-finder/document?url=${encodeURIComponent(fallback.document.url)}&download=${download ? "1" : "0"}`,
            request.url,
          ),
          { headers: request.headers },
        );
        return handleDocumentRequest(internalRequest);
      },
    },
  },
});
