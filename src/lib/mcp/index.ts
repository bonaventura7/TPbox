import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getCompanyFinancialsTool from "./tools/get-company-financials";
import getInterpelloTool from "./tools/get-interpello";
import searchCompaniesTool from "./tools/search-companies";
import searchInterpelliTool from "./tools/search-interpelli";
import searchNewsTool from "./tools/search-news";

// L'issuer OAuth deve essere l'host diretto del backend: il project ref è l'unico
// valore che resta invariato dopo la pubblicazione ed è inlinato a build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "tpbox",
  title: "TPBox",
  version: "0.1.0",
  instructions:
    "Strumenti del portale Transfer Pricing TPBox. Richiedono l'accesso con un account del portale. Usa search_news per gli aggiornamenti di attualità, search_interpelli e get_interpello per le risposte agli interpelli dell'Agenzia delle Entrate, search_companies per individuare una società e get_company_financials per il suo estratto economico-finanziario. Tutti i dati restituiti sono dimostrativi e vanno presentati come tali.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: ([
    searchNewsTool,
    searchInterpelliTool,
    getInterpelloTool,
    searchCompaniesTool,
    getCompanyFinancialsTool,
  ] as unknown) as Parameters<typeof defineMcp>[0]["tools"],
});
