import { createFileRoute } from "@tanstack/react-router";

function envKey(): string | undefined {
  const processLike = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return processLike?.env?.["OPENREGISTER_API_KEY"]?.trim();
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/company-finder/document")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const country = url.searchParams.get("country")?.trim().toUpperCase() || "DE";
        const company = url.searchParams.get("company")?.trim();
        const yearValue = url.searchParams.get("year")?.trim();
        if (!company) return errorResponse("società mancante", 400);

        const year = Number(yearValue);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          return errorResponse("esercizio non valido", 400);
        }

        const download = url.searchParams.get("download") === "1";

        if (country === "PL") {
          const krs = company.replace(/\D/g, "").padStart(10, "0");
          if (!/^\d{10}$/.test(krs)) return errorResponse("KRS non valido", 400);

          const { fetchPolishAnnualReport } = await import(
            "@/lib/company-finder/sources/bilanci/poland-rdf"
          );
          const result = await fetchPolishAnnualReport(krs, year, 30_000);
          if (!result.ok || !result.bytes.byteLength) {
            return errorResponse(result.error ?? `bilancio ${year} non disponibile`, 502);
          }

          const contentType = result.contentType || "application/octet-stream";
          const filename = result.filename ?? `bilancio-${krs}-${year}`;
          return new Response(result.bytes, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        if (country === "FR") {
          const siren = url.searchParams.get("siren")?.replace(/\D/g, "") ?? "";
          if (!/^\d{9}$/.test(siren)) return errorResponse("SIREN non valido", 400);

          const { findPappersAnnualReport } =
            await import("@/lib/company-finder/sources/bilanci/pappers-public-fr.server");
          const result = await findPappersAnnualReport(company, siren, year);
          if (!result.ok || !result.document?.url) {
            return errorResponse(result.error ?? `bilancio ${year} non disponibile`, 502);
          }

          const { handleDocumentRequest } =
            await import("@/lib/company-finder/document-proxy.server");
          const internalRequest = new Request(
            new URL(
              `/api/company-finder/document?url=${encodeURIComponent(result.document.url)}&download=${download ? "1" : "0"}`,
              request.url,
            ),
            { headers: request.headers },
          );
          return handleDocumentRequest(internalRequest);
        }

        if (country !== "DE") return errorResponse("paese documento non supportato", 400);

        const key = envKey();
        if (key) {
          const { fetchOpenRegisterAnnualReport } =
            await import("@/lib/company-finder/sources/bilanci/openregister-de");
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

        const { findOfficialUrPublication } =
          await import("@/lib/company-finder/sources/bilanci/ur-de");
        const fallback = await findOfficialUrPublication(company, year, 30000);
        if (!fallback.ok || !fallback.document?.url) {
          return errorResponse(fallback.error ?? `bilancio ${year} non disponibile`, 502);
        }

        const { handleDocumentRequest } =
          await import("@/lib/company-finder/document-proxy.server");
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
