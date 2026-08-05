import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string } | null;
  scope?: string | null;
  redirect_uri?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthResult = { data: AuthorizationDetails | null; error: Error | null };

// `supabase.auth.oauth` is a beta namespace not yet in the published types.
function oauthApi() {
  return (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
      approveAuthorization: (id: string) => Promise<OAuthResult>;
      denyAuthorization: (id: string) => Promise<OAuthResult>;
    };
  }).oauth;
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Verificare la tua identità",
  email: "Conoscere il tuo indirizzo e-mail",
  profile: "Conoscere i dati essenziali del tuo profilo",
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: il client legge la sessione da localStorage, assente in SSR.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id:
      typeof search['authorization_id'] === "string" ? (search['authorization_id'] as string) : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("authorization_id mancante");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + location.searchStr },
      });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.searchStr).get(
      "authorization_id",
    )!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  head: () => ({
    meta: [
      { title: "Autorizza l'accesso — Osservatorio Transfer Pricing" },
      {
        name: "description",
        content:
          "Schermata di autorizzazione: consente a un client esterno di usare gli strumenti del portale a tuo nome.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-serif text-2xl">Richiesta non valida</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Non è stato possibile caricare questa richiesta di autorizzazione:{" "}
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "un'applicazione esterna";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: apiError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (apiError) {
      setBusy(false);
      setError(apiError.message);
      return;
    }
    const targetUrl = data?.redirect_url ?? data?.redirect_to;
    if (!targetUrl) {
      setBusy(false);
      setError("Il server di autorizzazione non ha restituito un indirizzo di ritorno.");
      return;
    }
    window.location.href = targetUrl;
  }

  return (
    <main className="mx-auto max-w-md px-4 py-14 sm:py-20">
      <div className="border border-border bg-card p-6">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Autorizzazione
        </p>
        <h1 className="mt-2 font-serif text-2xl leading-snug">
          Collega {clientName} al tuo account
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {clientName} potrà usare gli strumenti del portale a tuo nome, con i tuoi
          permessi.
        </p>

        {scopes.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm">
            {scopes.map((scope: string) => (
              <li key={scope}>· {SCOPE_LABELS[scope] ?? `Permesso aggiuntivo: ${scope}`}</li>
            ))}
          </ul>
        ) : null}

        {details?.redirect_uri ? (
          <p className="mt-4 text-xs break-all text-muted-foreground">
            Indirizzo di ritorno: {details.redirect_uri}
          </p>
        ) : null}

        <p className="mt-4 text-xs text-muted-foreground">
          L'autorizzazione non aggira i permessi del portale né le regole di accesso ai
          dati.
        </p>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void decide(true)} className="min-h-11">
            Autorizza
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void decide(false)}
            className="min-h-11"
          >
            Annulla il collegamento
          </Button>
        </div>
      </div>
    </main>
  );
}