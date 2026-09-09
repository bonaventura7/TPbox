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
const greekRoute = `
  // ---- Grecia: ΓΕΜΗ Open Data + fallback pubblico iXBRL ----
  GR: {
    id: "fin-gemi-gr",
    label: "ΓΕΜΗ — bilanci e documenti finanziari pubblici",
    run: (ctx, job, s) =>
      (async () => {
        const r = await fetchGreekFinancials({
          localVat: ctx.localVat,
          query: ctx.query,
          ...(GEMI_API_KEY ? { apiKey: GEMI_API_KEY } : {}),
        });
        if (r.ok) {
          s.state = "ok";
          const n = r.financials.documents?.length ?? 0;
          s.detail =
            n > 0
              ? n + " documenti finanziari"
              : (r.financials.documentTitle ?? "filing GEMI disponibile");
          if (r.profile) {
            const profile = r.profile;
            job.profile = () => profile;
          }
          const fin = r.financials;
          job.fin = () => fin;
          return;
        }
        s.state = "skipped";
        s.detail = r.skipped;
        job.fin = () => ({
          available: false,
          years: [],
          source: "ΓΕΜΗ — Business Portal",
          availability: "REGISTRY_ONLY",
          restriction: "SOURCE_RESTRICTION",
          documents: [],
          note: r.skipped,
        });
      })(),
  },
`;
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
const oldGreece = `  {
    iso: "GR",
    nameIt: "Grecia",
    flag: "🇬🇷",
    vatPrefix: "EL",
    registryName: "ΓΕΜΗ (GEMI) — Business Portal",
    registryAuthority: "Ministero dello Sviluppo",
    financials: {
      free: false,
      note: "Le pubblicazioni con i bilanci (Οικονομικές Καταστάσεις) sono scaricabili GRATIS dal portale GEMI (publicity.businessportal.gr), ma il portale è protetto da reCAPTCHA: l'estrazione automatica è in studio. In questa vista: identità e stato dal VIES.",
    },
  },`;
const newGreece = `  {
    iso: "GR",
    nameIt: "Grecia",
    flag: "🇬🇷",
    vatPrefix: "EL",
    registryName: "ΓΕΜΗ (GEMI) — Business Portal",
    registryAuthority: "Ministero dello Sviluppo",
    financials: {
      free: true,
      note: "I documenti finanziari pubblici GEMI sono gratuiti: con GEMI_API_KEY il tool risolve IVA/nome → GEMI → fascicolo documentale; senza chiave, un numero GEMI consente il fallback al filing iXBRL pubblico. CAPTCHA/sessione non vengono aggirati.",
    },
  },`;
if (countries.includes(oldGreece)) countries = countries.replace(oldGreece, newGreece);
else if (!countries.includes('iso: "GR"')) throw new Error("GR country block not found");
write(countriesPath, countries);

const envPath = ".env.example";
let env = read(envPath);
if (!env.includes("GEMI_API_KEY=")) {
  env += "\n\n# Grecia: ΓΕΜΗ Open Data — chiave personale richiesta dal registro ufficiale.\n# https://opendata.businessportal.gr/register/\nGEMI_API_KEY=\n";
}
write(envPath, env);

const gemiPath = "src/lib/company-finder/sources/bilanci/gemi-gr.ts";
let gemi = read(gemiPath);
gemi = gemi.replace(
  'registry: { name: "GEMI", authority: "Business Portal", id: company.arGemi?.toString() },',
  'registry: {\n      name: "GEMI",\n      authority: "Business Portal",\n      ...(company.arGemi ? { id: company.arGemi.toString() } : {}),\n    },',
);
gemi = gemi.replace(
  '      looksLikeGreekFinancialDocument({\n        summary: decision.summary,\n        decisionSubject: decision.decisionSubject,\n        url: decision.assemblyDecisionUrl,\n      }),',
  '      looksLikeGreekFinancialDocument({\n        ...(decision.summary ? { summary: decision.summary } : {}),\n        ...(decision.decisionSubject ? { decisionSubject: decision.decisionSubject } : {}),\n        ...(decision.assemblyDecisionUrl ? { url: decision.assemblyDecisionUrl } : {}),\n      }),',
);
write(gemiPath, gemi);

const companyFinderFunctionsPath = "src/lib/company-finder.functions.ts";
let companyFinderFunctions = read(companyFinderFunctionsPath);
companyFinderFunctions = companyFinderFunctions.replace(
  'years:selected,',
  'years:selected.map((year)=>({periodLabel:String(year),year,currency:"PLN"})),',
);
write(companyFinderFunctionsPath, companyFinderFunctions);

const polandRdfPath = "src/lib/company-finder/sources/bilanci/poland-rdf.ts";
let polandRdf = read(polandRdfPath);
polandRdf = polandRdf.replace(
  'document:secondary.document?{id:secondary.document.id,year:secondary.document.year??year,title:secondary.document.title,format:"pdf"}:undefined',
  '...(secondary.document?{document:{id:secondary.document.id,year:secondary.document.year??year,title:secondary.document.title,format:"pdf"}}:{})',
);
write(polandRdfPath, polandRdf);
