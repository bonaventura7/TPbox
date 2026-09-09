import { createFileRoute } from "@tanstack/react-router";

function errorResponse(message: string, status: number, details?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...details }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/company-finder/document")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("url")) {
          const { handleDocumentRequest } =
            await import("@/lib/company-finder/document-proxy.server");
          return handleDocumentRequest(request);
        }

        const country = url.searchParams.get("country")?.trim().toUpperCase() || "DE";
        const company = url.searchParams.get("company")?.trim();
        const yearValue = url.searchParams.get("year")?.trim();
        if (!company) return errorResponse("società mancante", 400);
        const year = Number(yearValue);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) return errorResponse("esercizio non valido", 400);
        const download = url.searchParams.get("download") === "1";

        if (country === "PL") {
          const krs = company.replace(/\D/g, "").padStart(10, "0");
          if (!/^\d{10}$/.test(krs)) return errorResponse("KRS non valido", 400);

          const { fetchPolishAnnualReport } = await import("@/lib/company-finder/sources/bilanci/poland-rdf");
          const result = await fetchPolishAnnualReport(krs, year, 30000);
          if (!result.ok) {
            const { polishOfficialBrowserUrl } = await import("@/lib/company-finder/pl-official-fallback");
            return new Response(null, {
              status: 302,
              headers: {
                Location: polishOfficialBrowserUrl(krs),
                "Cache-Control": "no-store",
                "X-Company-Finder-Fallback": "official-polish-rdf-browser",
              },
            });
          }

          const { isPdfBytes } = await import("@/lib/company-finder/pl-pdf-gate");
          if (!isPdfBytes(result.bytes)) {
            return errorResponse("il registro polacco non ha restituito un PDF valido", 502, { fallback: "official-browser" });
          }

          return new Response(new Uint8Array(result.bytes) as unknown as BodyInit, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `${download ? "attachment" : "inline"}; filename="bilancio-${krs}-${year}.pdf"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        if (country === "EE") {
          const code = company.replace(/\D/g, "");
          if (!/^\d{8}$/.test(code)) return errorResponse("registrikood non valido", 400);
          const { fetchEeFileDocument, resolveEeFiling } = await import("@/lib/company-finder/sources/bilanci/ariregister-ee");
          const filing = await resolveEeFiling(code, year);
          if (!filing.ok || !filing.fileId) return errorResponse(filing.error ?? `bilancio ${year} non disponibile`, 502);
          const doc = await fetchEeFileDocument(code, filing.fileId);
          if (!doc.ok || !doc.bytes) return errorResponse(doc.error ?? `bilancio ${year} non disponibile`, 502);
          const isPdf = (doc.contentType ?? "").includes("pdf");
          const ext = isPdf ? "pdf" : "html";
          return new Response(doc.bytes, {
            status: 200,
            headers: {
              "Content-Type": doc.contentType ?? (isPdf ? "application/pdf" : "text/html; charset=utf-8"),
              "Content-Disposition": `${download ? "attachment" : "inline"}; filename="bilancio-EE-${code}-${year}.${ext}"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        if (country === "NO") {
          const orgnr = company.replace(/\D/g, "");
          if (!/^\d{9}$/.test(orgnr)) return errorResponse("org.nr norvegese non valido", 400);
          const { fetchBrregAnnualReportDocument } = await import("@/lib/company-finder/sources/bilanci/brreg-no");
          const doc = await fetchBrregAnnualReportDocument(orgnr, year, 30000);
          if (!doc.ok || !doc.bytes) {
            return errorResponse(doc.error ?? `bilancio ${year} non disponibile`, 502, { fallback: "official-registry" });
          }
          return new Response(doc.bytes, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `${download ? "attachment" : "inline"}; filename="bilancio-NO-${orgnr}-${year}.pdf"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        if (country === "FR") {
          const siren = url.searchParams.get("siren")?.replace(/\D/g, "") ?? "";
          if (!/^\d{9}$/.test(siren)) return errorResponse("SIREN non valido", 400);
          const { findPappersAnnualReport } = await import("@/lib/company-finder/sources/bilanci/pappers-public-fr.server");
          const result = await findPappersAnnualReport(company, siren, year);
          if (!result.ok || !result.document?.url) return errorResponse(result.error ?? `bilancio ${year} non disponibile`, 502);
          const { handleDocumentRequest } = await import("@/lib/company-finder/document-proxy.server");
          return handleDocumentRequest(new Request(new URL(`/api/company-finder/document?url=${encodeURIComponent(result.document.url)}&download=${download ? "1" : "0"}`, request.url), { headers: request.headers }));
        }

        // Germania: il bilancio strutturato è servito dalle rotte dedicate
        // (financial-document / germany-public-balance); questo endpoint non
        // espone un documento tedesco scaricabile.
        return errorResponse("paese documento non supportato", 400);
      },
    },
  },
});
