/**
 * Guard client-safe sulla configurazione Supabase esposta al frontend.
 * Solo URL e publishable key (config pubblica): nessun secret, nessun fallback hardcoded.
 */
function readEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY"): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function supabaseClientConfigured(): boolean {
  return readEnv("VITE_SUPABASE_URL") !== "" && readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") !== "";
}

export const SUPABASE_CONFIG_MISSING_MESSAGE =
  "Configurazione backend assente: accesso e area riservata non disponibili.";

let warned = false;

/** Registra una sola volta l'errore diagnostico, senza mascherare la causa. */
export function warnSupabaseConfigMissing(context: string): void {
  if (warned) return;
  warned = true;
  console.error(
    `[Supabase] ${SUPABASE_CONFIG_MISSING_MESSAGE} (origine: ${context}). ` +
      "Attese VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY nel build client.",
  );
}
