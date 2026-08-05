import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_news",
  title: "Cerca aggiornamenti Transfer Pricing",
  description:
    "Cerca fra gli aggiornamenti pubblicati nella sezione Attualità del portale, con filtri per area geografica, tema e sole fonti istituzionali. I contenuti sono dimostrativi.",
  inputSchema: {
    query: z.string().max(120).optional().describe("Parola chiave libera."),
    geo: z
      .enum(["TUTTE", "OCSE", "UE", "ITALIA", "GLOBALE"])
      .optional()
      .describe("Area geografica; per impostazione predefinita tutte."),
    topic: z
      .enum([
        "TUTTI",
        "Metodi e comparabili",
        "Intangibili",
        "Servizi infragruppo",
        "Pillar Two",
        "APA e MAP",
        "Documentazione",
        "Contenzioso",
      ])
      .optional()
      .describe("Tema editoriale."),
    institutionalOnly: z
      .boolean()
      .optional()
      .describe("Se vero, restituisce solo fonti istituzionali."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input) => {
    const { listNewsFeed } = await import(
      "../../repositories/news.repository.server"
    );
    const feed = await listNewsFeed({
      query: input.query ?? "",
      geo: input.geo ?? "TUTTE",
      topic: input.topic ?? "TUTTI",
      institutionalOnly: input.institutionalOnly ?? false,
    });
    const items = [
      ...(feed.featured ? [feed.featured] : []),
      ...feed.latest,
      ...feed.archive,
    ].map((item) => ({
      id: item.id,
      titolo: item.title,
      sintesi: item.summary,
      fonte: item.sourceName,
      tipoFonte: item.sourceKind,
      dataOriginale: item.originalDate,
      lingua: item.language,
      area: item.geo,
      tema: item.topic,
      ultimaVerifica: item.lastVerifiedAt,
      urlOriginale: item.originalUrl,
      dimostrativo: true,
    }));
    if (feed.health === "DEGRADED" && items.length === 0) {
      throw new ToolError("Il servizio di aggregazione non è disponibile.");
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ items }, null, 2) }],
      structuredContent: { total: items.length, health: feed.health, items },
    };
  },
});
