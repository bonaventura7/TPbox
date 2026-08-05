import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_companies",
  title: "Cerca società",
  description:
    "Cerca una società per ragione sociale o numero di partita IVA e restituisce i candidati con il relativo identificativo interno, da usare con get_company_financials. Dati dimostrativi.",
  inputSchema: {
    query: z.string().max(160).describe("Ragione sociale o numero di partita IVA."),
    country: z
      .string()
      .max(2)
      .optional()
      .describe("Codice paese a due lettere, facoltativo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input) => {
    const { searchCompanies } = await import(
      "../../repositories/tools.repository.server"
    );
    const result = await searchCompanies({
      query: input.query,
      country: input.country ?? "",
    });
    const candidates = result.candidates.map((item) => ({
      companyId: item.companyId,
      ragioneSociale: item.legalName,
      paese: item.country,
      citta: item.city,
      formaGiuridica: item.legalForm,
      attivita: item.activity,
      ultimoEsercizioDepositato: item.lastFilingYear,
      dimostrativo: true,
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ modo: result.mode, messaggio: result.message, candidates }, null, 2),
        },
      ],
      structuredContent: { mode: result.mode, message: result.message, candidates },
    };
  },
});
