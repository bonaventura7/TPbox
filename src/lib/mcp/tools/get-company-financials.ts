import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_company_financials",
  title: "Estratto economico-finanziario",
  description:
    "Restituisce l'estratto dei dati economico-finanziari e gli indici di una società già individuata con search_companies. Dati dimostrativi.",
  inputSchema: {
    companyId: z
      .string()
      .min(3)
      .max(64)
      .describe("Identificativo interno restituito da search_companies."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ companyId }) => {
    const { fetchBilancio } = await import(
      "../../repositories/tools.repository.server"
    );
    const result = await fetchBilancio({ companyId, role: "PRO" });
    if (result.status === "NOT_FOUND") throw new ToolError(result.message);
    if (result.status !== "OK" && result.status !== "DEGRADED") {
      return {
        content: [{ type: "text", text: result.message }],
        isError: true,
      };
    }
    const payload = {
      companyId: result.companyId,
      ragioneSociale: result.legalName,
      stato: result.status,
      esercizi: result.years.map((year) => ({
        anno: year.year,
        ricavi: year.revenue,
        risultatoOperativo: year.ebit,
        risultatoNetto: year.netResult,
        totaleAttivo: year.totalAssets,
        patrimonioNetto: year.equity,
        dipendenti: year.employees,
      })),
      indici: result.ratios.map((ratio) => ({ indice: ratio.label, valore: ratio.value })),
      dimostrativo: true,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
