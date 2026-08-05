import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_interpello",
  title: "Dettaglio risposta a interpello",
  description:
    "Restituisce la scheda completa di una risposta a interpello a partire dal suo identificativo, come pubblicata nel portale. Contenuti dimostrativi.",
  inputSchema: {
    id: z.string().min(3).max(64).describe("Identificativo della risposta."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const { getInterpelloById } = await import(
      "../../repositories/agenzia-interpelli.repository.server"
    );
    const { subjectLabel } = await import("../../domain/interpelli");
    const record = await getInterpelloById(id);
    if (!record) throw new ToolError(`Nessuna risposta trovata per l'identificativo "${id}".`);
    const payload = {
      id: record.id,
      numero: record.number,
      titolo: record.title,
      dataPubblicazione: record.publicationDate,
      materia: subjectLabel(record.subject),
      sottoMateria: record.subSubject,
      quesito: record.question,
      soluzione: record.answerSummary,
      riferimentiNormativi: record.legalReferences,
      argomentiCollegati: record.relatedTopics,
      urlUfficiale: record.officialUrl,
      fonte: record.sourceName,
      ultimaVerifica: record.lastVerifiedAt,
      dimostrativo: true,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
