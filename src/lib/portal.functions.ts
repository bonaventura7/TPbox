import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const geo = z.enum(["TUTTE", "OCSE", "UE", "ITALIA", "GLOBALE"]);
const topic = z.enum([
  "TUTTI",
  "Metodi e comparabili",
  "Intangibili",
  "Servizi infragruppo",
  "Pillar Two",
  "APA e MAP",
  "Documentazione",
  "Contenzioso",
]);

const newsFiltersSchema = z.object({
  query: z.string().max(120).default(""),
  geo: geo.default("TUTTE"),
  topic: topic.default("TUTTI"),
  institutionalOnly: z.boolean().default(false),
  category: z
    .enum(["TUTTE", "Transfer Pricing", "VAT", "Pillar Two", "Anti-Avoidance"])
    .default("TUTTE"),
  country: z.string().max(60).default(""),
});

export const getNewsFeed = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => newsFiltersSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { getNewsRepo } = await import("./repositories/news.repo.server");
    return getNewsRepo().getPublished(data);
  });

/**
 * Secondo livello della sezione Attualità: l'articolo redazionale.
 * Lo slug è validato sulla forma, così un parametro arbitrario non arriva
 * al filtro della vista pubblica.
 */
export const getNewsArticle = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z
          .string()
          .min(1)
          .max(160)
          .regex(/^[a-z0-9-]+$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getNewsRepo } = await import("./repositories/news.repo.server");
    return getNewsRepo().getBySlug(data.slug);
  });

export const getSources = createServerFn({ method: "GET" }).handler(async () => {
  const { getNewsRepo } = await import("./repositories/news.repo.server");
  return getNewsRepo().getSources();
});

export const searchCompanies = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ query: z.string().max(160), country: z.string().max(2).default("") })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { searchCompanies: run } = await import("./repositories/tools.repository.server");
    return run(data);
  });

export const getBilancio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        companyId: z.string().min(3).max(64),
        simulate: z
          .enum([
            "OK",
            "NOT_AUTHORIZED",
            "PROVIDER_UNAVAILABLE",
            "RATE_LIMITED",
            "DEGRADED",
          ])
          .default("OK"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { fetchBilancio } = await import("./repositories/tools.repository.server");
    // Il ruolo effettivo sarà letto dalla sessione autenticata (USER/EDITOR/ADMIN/PRO).
    return fetchBilancio({
      companyId: data.companyId,
      role: data.simulate === "NOT_AUTHORIZED" ? "USER" : "PRO",
      simulate: data.simulate === "NOT_AUTHORIZED" ? "OK" : data.simulate,
    });
  });

/** Archivio interpelli: l'acquisizione è solo server-side, il browser non contatta fonti esterne. */
export const getInterpelliArchive = createServerFn({ method: "GET" }).handler(async () => {
  const { listInterpelliArchive } = await import(
    "./repositories/agenzia-interpelli.repository.server"
  );
  return listInterpelliArchive();
});

export const getInterpello = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().min(3).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { getInterpelloById } = await import(
      "./repositories/agenzia-interpelli.repository.server"
    );
    return getInterpelloById(data.id);
  });

/**
 * Patent & IP: la ricerca resta interna al portale. L'eventuale acquisizione
 * dal provider avviene solo lato server, con allowlist e revisione.
 */
const patentQuerySchema = z.object({
  query: z.string().max(160).default(""),
  applicant: z.string().max(120).default(""),
  ipc: z.string().max(40).default(""),
  jurisdiction: z.string().max(4).default(""),
  technologyArea: z.string().max(80).default(""),
  yearFrom: z.number().int().min(1980).max(2100).nullable().default(null),
  yearTo: z.number().int().min(1980).max(2100).nullable().default(null),
  sort: z
    .enum(["RELEVANZA", "DATA_DESC", "DATA_ASC", "FAMIGLIA_DESC"])
    .default("RELEVANZA"),
  page: z.number().int().min(1).max(200).default(1),
  pageSize: z.number().int().min(5).max(50).default(10),
});

export const searchPatents = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => patentQuerySchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { searchPatents: run } = await import(
      "./repositories/patents.repository.server"
    );
    return run(data);
  });

export const getPatent = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().min(3).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { getPatentById } = await import("./repositories/patents.repository.server");
    return getPatentById(data.id);
  });
