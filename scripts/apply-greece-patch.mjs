import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);

const orchestratorPath = "src/lib/company-finder/orchestrator.ts";
let orchestrator = read(orchestratorPath);
if (!orchestrator.includes('from "./sources/bilanci/gemi-gr"')) {
  orchestrator = orchestrator.replace(
    'import { lookupUkPublic } from "./sources/bilanci/companies-house-public";\n',
    'import { lookupUkPublic } from "./sources/bilanci/companies-house-public";\nimport { fetchGreekFinancials } from "./sources/bilanci/gemi-gr";\n',
  );
}
if (!orchestrator.includes('const GEMI_API_KEY = ENV["GEMI_API_KEY"];')) {
  orchestrator = orchestrator.replace(
    'const NBB_CBSO_BASE = ENV["NBB_CBSO_BASE"]; // es. https://ws.uat2.cbso.nbb.be (test, chiave gratuita)\n',
    'const NBB_CBSO_BASE = ENV["NBB_CBSO_BASE"]; // es. https://ws.uat2.cbso.nbb.be (test, chiave gratuita)\nconst GEMI_API_KEY = ENV["GEMI_API_KEY"];\n',
  );
}
const greekRoute = `\n  // ---- Grecia: ΓΕΜΗ Open Data + fallback pubblico iXBRL ----\n  GR: {\n    id: "fin-gemi-gr",\n    label: "ΓΕΜΗ — bilanci e documenti finanziari pubblici",\n    run: (ctx, job, s) =>\n      (async () => {\n        const r = await fetchGreekFinancials({\n          localVat: ctx.localVat,\n          query: ctx.query,\n          apiKey: GEMI_API_KEY,\n        });\n        if (r.ok) {\n          s.state = "ok";\n          const n = r.financials.documents?.length ?? 0;\n          s.detail = n > 0 ? \\\`${n} documenti finanziari\\\` : r.financials.documentTitle ?? "filing GEMI disponibile";\n          if (r.profile) {\n            const profile = r.profile;\n            job.profile = () => profile;\n          }\n          const fin = r.financials;\n          job.fin = () => fin;\n          return;\n        }\n        s.state = "skipped";\n        s.detail = r.skipped;\n        job.fin = () => ({\n          available: false,\n          years: [],\n          source: "ΓΕΜΗ — Business Portal",\n          availability: "REGISTRY_ONLY",\n          restriction: "SOURCE_RESTRICTION",\n          documents: [],\n          note: r.skipped,\n        });\n      })(),\n  },\n`;
if (!orchestrator.includes('id: "fin-gemi-gr"')) {
  const marker = '\n};\n\n// ============================================================================\n// Esecuzione';
  if (!orchestrator.includes(marker)) throw new Error("FINANCIALS_ROUTES marker not found");
  orchestrator = orchestrator.replace(marker, `${greekRoute}${marker}`);
}
write(orchestratorPath, orchestrator);

const coveragePath = "src/lib/company-finder/coverage.ts";
let coverage = read(coveragePath);
coverage = coverage.replace(
  'export const AUTO_ISOS = ["DE", "NL", "DK", "UK", "FR", "EE", "NO"] as const;',
  'export const AUTO_ISOS = ["DE", "NL", "DK", "UK", "FR", "EE", "NO", "GR"] as const;',
);
write(coveragePath, coverage);

const countriesPath = "src/lib/company-finder/countries.ts";
let countries = read(countriesPath);
countries = countries.replace(
  /iso: "GR",\n    nameIt: "Grecia",[\\s\\S]*?financials: \{\n      free: false,\n      note: "Le pubblicazioni con i bilanci[^\\n]+\n    \},/,
  `iso: "GR",\n    nameIt: "Grecia",\n    flag: "🇬🇷",\n    vatPrefix: "EL",\n    registryName: "ΓΕΜΗ (GEMI) — Business Portal",\n    registryAuthority: "Ministero dello Sviluppo",\n    financials: {\n      free: true,\n      note: "I documenti finanziari pubblici GEMI sono gratuiti: con GEMI_API_KEY il tool risolve IVA/nome → GEMI → fascicolo documentale; senza chiave, un numero GEMI consente il fallback al filing iXBRL pubblico. CAPTCHA/sessione non vengono aggirati.",\n    },`,
);
write(countriesPath, countries);

const envPath = ".env.example";
let env = read(envPath);
if (!env.includes("GEMI_API_KEY=")) {
  env += '\n\n# Grecia: ΓΕΜΗ Open Data — chiave personale richiesta dal registro ufficiale.\n# https://opendata.businessportal.gr/register/\nGEMI_API_KEY=\n';
}
write(envPath, env);
