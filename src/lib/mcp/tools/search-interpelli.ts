import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_interpelli",
  title: "Cerca risposte a interpello",
  description:
    "Cerca fra le risposte agli interpelli dell'Agenzia delle Entrate presenti nel portale, per parola chiave, materia, anno e pertinenza al Transfer Pricing. I contenuti sono dimostrativi.",
  inputSchema: {
    query: z
      .string()
      .max(160)
      .optional()
      .describe("Parola chiave, numero della risposta o argomento."),
    year: z.number().int().optional().describe("Anno di pubblicazione."),
    transferPricingOnly: z
      .boolean()
      .optional()
      .describe("Se vero, restituisce solo le risposte in materia di Transfer Pricing."),
    limit: z.number().int().optional().describe("Numero massimo di risultati (max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input) => {
    const { listInterpelliArchive } = await import(
      "../../repositories/agenzia-interpelli.repository.server"
    );
    const { isTransferPricingRecord, subjectLabel } = await import(
      "../../domain/interpelli"
    );
    const archive = await listInterpelliArchive();
    const term = (input.query ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    const records = archive.records
      .filter((item) =>
        term === ""
          ? true
          : [item.title, item.abstract, item.number, ...item.tags]
              .join(" ")
              .toLowerCase()
              .includes(term),
      )
      .filter((item) => (input.year === undefined ? true : item.year === input.year))
      .filter((item) => (input.transferPricingOnly ? isTransferPricingRecord(item) : true))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        numero: item.number,
        titolo: item.title,
        dataPubblicazione: item.publicationDate,
        materia: subjectLabel(item.subject),
        sottoMateria: item.subSubject,
        abstract: item.abstract,
        riferimentiNormativi: item.legalReferences,
        urlUfficiale: item.officialUrl,
        fonte: item.sourceName,
        dimostrativo: true,
      }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { statoServizio: archive.serviceStatus, records },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        total: records.length,
        serviceStatus: archive.serviceStatus,
        availableYears: archive.availableYears,
        records,
      },
    };
  },
});
