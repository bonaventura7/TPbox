import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  SUPABASE_CONFIG_MISSING_MESSAGE,
  supabaseClientConfigured,
  warnSupabaseConfigMissing,
} from "@/integrations/supabase/config";

/** Affordance di accesso guidata dalla sessione: mostra e-mail e uscita se autenticato. */
export function AuthMenu({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const configured = supabaseClientConfigured();

  useEffect(() => {
    if (!configured) {
      warnSupabaseConfigMissing("AuthMenu");
      return;
    }
    let active = true;
    try {
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          setEmail(data.session?.user.email ?? null);
          setReady(true);
        })
        .catch((error: unknown) => {
          console.error(error);
          if (active) setReady(true);
        });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setEmail(session?.user.email ?? null);
        setReady(true);
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } catch (error) {
      console.error(error);
      setReady(true);
      return () => {
        active = false;
      };
    }
  }, [configured]);

  if (!configured) {
    return (
      <span
        className="text-xs text-muted-foreground"
        role="status"
        title={SUPABASE_CONFIG_MISSING_MESSAGE}
      >
        Accesso non disponibile
      </span>
    );
  }

  if (!ready) return <span className="h-11 w-24" aria-hidden="true" />;

  if (!email) {
    return (
      <Button asChild variant="outline" className="min-h-11">
        <Link to="/auth" search={{ next: "/tool" }} onClick={onNavigate}>
          Accedi
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground xl:block">
        {email}
      </span>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={async () => {
          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error(error);
          }
          onNavigate?.();
          void navigate({ to: "/", replace: true });
        }}
      >
        Esci
      </Button>
    </div>
  );
}