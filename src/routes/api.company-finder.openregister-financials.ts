import { createFileRoute } from "@tanstack/react-router";

import {
  buildOpenRegisterFinancialCsv,
  fetchOpenRegisterFinancialsByCompanyId,
  reportList,
} from "@/lib/company-finder/sources/bilanci/openregister-de";

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function safeFilename(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "societa-tedesca";
}

export const Route = createFileRoute("/api/company-finder/openregister-financials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const companyId = url.searchParams.get("companyId")?.trim();
        const reportId = url.searchParams.get("reportId")?.trim();
        const apiKey = env()["OPENREGISTER_API_KEY"]?.trim();

        if (!apiKey) {
          return Response.json({ error: "OPENREGISTER_API_KEY non configurata" }, { status: 503 });
        }
        if (!companyId) {
          return Response.json({ error: "companyId mancante" }, { status: 400 });
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
          const payload = await fetchOpenRegisterFinancialsByCompanyId(companyId, apiKey, controller.signal);
          const reports = reportList(payload);
          if (reports.length === 0) {
            return Response.json({ error: "Nessun bilancio disponibile per la società selezionata" }, { status: 404 });
          }

          const report = reportId
            ? reports.find((candidate) => String(candidate["report_id"] ?? "") === reportId)
            : reports[0];
          if (!report) {
            return Response.json({ error: "Bilancio richiesto non trovato" }, { status: 404 });
          }

          const endDate = String(report["report_end_date"] ?? "");
          const year = /20\d{2}/.exec(endDate)?.[0] ?? "bilancio";
          const csv = buildOpenRegisterFinancialCsv(report, companyId);
          const filename = `${safeFilename(companyId)}-${year}.csv`;

          return new Response(csv, {
            status: 200,
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Cache-Control": "private, max-age=300",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          const err = error as { name?: string; message?: string } | undefined;
          const message = err?.name === "AbortError" ? "OpenRegister timeout" : err?.message ?? "OpenRegister non disponibile";
          return Response.json({ error: message }, { status: 502 });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
