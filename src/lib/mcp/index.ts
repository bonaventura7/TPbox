import { defineMcp } from "@lovable.dev/mcp-js";

import getCompanyFinancialsTool from "./tools/get-company-financials";
import getInterpelloTool from "./tools/get-interpello";
import searchCompaniesTool from "./tools/search-companies";
import searchInterpelliTool from "./tools/search-interpelli";
import searchNewsTool from "./tools/search-news";

export default defineMcp({
  name: "tpbox",
  title: "TPBox",
  version: "0.1.0",
  instructions:
    "Strumenti del portale Transfer Pricing TPBox. Usa search_news per gli aggiornamenti di attualità, search_interpelli e get_interpello per le risposte agli interpelli dell'Agenzia delle Entrate, search_companies per individuare una società e get_company_financials per il suo estratto economico-finanziario. Tutti i dati restituiti sono dimostrativi e vanno presentati come tali.",
  tools: [
    searchNewsTool,
    searchInterpelliTool,
    getInterpelloTool,
    searchCompaniesTool,
    getCompanyFinancialsTool,
  ],
});
