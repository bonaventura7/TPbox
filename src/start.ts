import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { supabase } from "@/integrations/supabase/client";
import { supabaseClientConfigured } from "@/integrations/supabase/config";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * Allega il bearer token alle chiamate delle server function, quando c'è una sessione.
 *
 * Vive qui e non in `integrations/supabase/auth-attacher.ts` per una ragione precisa:
 * quel file si dichiara generato automaticamente, quindi una rigenerazione
 * cancellerebbe la protezione senza rumore e il sito tornerebbe a non caricare senza
 * che nessuno colleghi la causa all'effetto. `src/start.ts` è mantenuto a mano.
 *
 * La protezione è necessaria perché `supabase` è un Proxy il cui getter costruisce il
 * client al primo accesso e solleva un'eccezione quando la configurazione manca. Questo
 * middleware è globale e gira sul client prima di ogni server function: senza guardia,
 * l'eccezione uccide la chiamata prima che parta il fetch. Il risultato osservato era
 * una sezione Attualità perennemente in errore, con zero richieste di rete e un server
 * perfettamente sano — un guasto che sembra di rete e non lo è.
 *
 * Senza configurazione si prosegue senza header: le pagine pubbliche non hanno bisogno
 * di autenticazione, e negarla del tutto è meglio che negare l'intera pagina.
 */
export const attachSupabaseAuthWhenConfigured = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (!supabaseClientConfigured()) {
      return next({ headers: {} });
    }
    try {
      const { data, error } = await supabase.auth.getSession();
      const token = error ? undefined : data.session?.access_token;
      return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch {
      // Una sessione non recuperabile non deve impedire di leggere il sito.
      return next({ headers: {} });
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthWhenConfigured],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
