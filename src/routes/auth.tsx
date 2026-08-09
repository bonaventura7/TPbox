import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/site/SectionPage";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import {
  SUPABASE_CONFIG_MISSING_MESSAGE,
  supabaseClientConfigured,
  warnSupabaseConfigMissing,
} from "@/integrations/supabase/config";

const TITLE = "Accedi all'Osservatorio";
const DESCRIPTION =
  "Accesso riservato: l'autenticazione protegge gli strumenti e le integrazioni per agenti (MCP) del portale Transfer Pricing.";

/** Consente solo percorsi relativi same-origin, così il redirect non può uscire dal sito. */
function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search['next'] === "string" ? (search['next'] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const target = safeNext(next || "/tool");
  const configured = supabaseClientConfigured();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      warnSupabaseConfigMissing("/auth");
      return;
    }
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && data.session) window.location.href = target;
      })
      .catch((error: unknown) => {
        console.error(error);
      });
    return () => {
      active = false;
    };
  }, [target, configured]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + target },
      });
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setNotice(
        "Registrazione ricevuta. Controlla la posta elettronica e conferma l'indirizzo per completare l'accesso.",
      );
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    void navigate({ to: target as string, replace: true });
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth" + `?next=${encodeURIComponent(target)}`,
    });
    if (result.error) {
      setBusy(false);
      setError("Accesso con Google non riuscito. Riprova.");
      return;
    }
    if (result.redirected) return;
    window.location.href = target;
  }

  return (
    <>
      <PageHeader eyebrow="Area riservata" title={TITLE} intro={DESCRIPTION} />
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-14">
        {!configured ? (
          <div className="border border-border bg-card p-6">
            <p role="status" className="text-sm text-foreground">
              {SUPABASE_CONFIG_MISSING_MESSAGE}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              L'accesso tornerà disponibile al ripristino della configurazione del backend. Le
              sezioni pubbliche del portale restano consultabili.
            </p>
          </div>
        ) : (
        <div className="border border-border bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Indirizzo e-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="min-h-11 w-full">
              {mode === "signin" ? "Accedi" : "Crea l'account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs tracking-wide text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            oppure
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void onGoogle()}
            className="min-h-11 w-full"
          >
            Continua con Google
          </Button>

          <p className="mt-5 text-sm text-muted-foreground">
            {mode === "signin" ? "Non hai un account?" : "Hai già un account?"}{" "}
            <button
              type="button"
              className="text-petrol underline underline-offset-4"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "signin" ? "Registrati" : "Accedi"}
            </button>
          </p>
        </div>
      </div>
    </>
  );
}