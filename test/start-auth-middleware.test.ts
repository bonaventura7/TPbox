import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Il middleware globale delle server function gira sul client prima di ogni chiamata.
 * Se tocca il client Supabase senza configurazione, il getter del Proxy solleva e la
 * chiamata muore prima del fetch: la pagina va in errore con zero richieste di rete e
 * un server perfettamente sano. È il guasto che ha tenuto ferma la sezione Attualità.
 *
 * Qui si difendono due proprietà distinte. La prima è comportamentale: senza
 * configurazione il client Supabase non viene mai toccato e la catena prosegue. La
 * seconda è di collocazione: la guardia deve stare in un file mantenuto a mano, perché
 * `auth-attacher.ts` si dichiara generato e una rigenerazione la cancellerebbe senza
 * lasciare traccia.
 */

const getSession = vi.fn();
const configured = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get auth() {
      return { getSession };
    },
  },
}));

vi.mock("@/integrations/supabase/config", () => ({
  supabaseClientConfigured: () => configured(),
}));

/** Il middleware è esportato: si prova direttamente, senza frugare negli interni. */
async function clientMiddleware() {
  vi.resetModules();
  const mod = await import("../src/start");
  return mod.attachSupabaseAuthWhenConfigured.options.client as
    | ((ctx: { next: (arg: unknown) => Promise<unknown> }) => Promise<unknown>)
    | undefined;
}

describe("middleware auth globale: comportamento", () => {
  beforeEach(() => {
    getSession.mockReset();
    configured.mockReset();
  });

  it("senza configurazione non tocca Supabase e lascia proseguire la chiamata", async () => {
    configured.mockReturnValue(false);
    const client = await clientMiddleware();
    expect(client, "il middleware globale non è registrato").toBeTypeOf("function");

    const next = vi.fn(async (arg: unknown) => arg);
    await client!({ next });

    expect(getSession, "il client Supabase è stato toccato senza configurazione").not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith({ headers: {} });
  });

  it("con una sessione valida allega il bearer token", async () => {
    configured.mockReturnValue(true);
    getSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } }, error: null });
    const client = await clientMiddleware();

    const next = vi.fn(async (arg: unknown) => arg);
    await client!({ next });

    expect(next).toHaveBeenCalledWith({ headers: { Authorization: "Bearer tok-123" } });
  });

  it("con getSession in errore prosegue senza header invece di far fallire la chiamata", async () => {
    configured.mockReturnValue(true);
    getSession.mockResolvedValue({ data: { session: null }, error: { message: "boom" } });
    const client = await clientMiddleware();

    const next = vi.fn(async (arg: unknown) => arg);
    await client!({ next });

    expect(next).toHaveBeenCalledWith({ headers: {} });
  });

  it("se getSession solleva, la server function parte lo stesso", async () => {
    configured.mockReturnValue(true);
    getSession.mockRejectedValue(new Error("Missing Supabase environment variable(s)"));
    const client = await clientMiddleware();

    const next = vi.fn(async (arg: unknown) => arg);
    await client!({ next });

    expect(next).toHaveBeenCalledWith({ headers: {} });
  });
});

describe("middleware auth globale: collocazione", () => {
  const startSource = readFileSync(new URL("../src/start.ts", import.meta.url), "utf8");
  const generatedSource = readFileSync(
    new URL("../src/integrations/supabase/auth-attacher.ts", import.meta.url),
    "utf8",
  );

  it("la guardia vive in src/start.ts", () => {
    expect(startSource).toContain("supabaseClientConfigured");
  });

  it("non registra il middleware del file generato, che non ha guardia", () => {
    // `auth-attacher.ts` si dichiara generato: importarlo qui rimetterebbe in gioco un
    // middleware privo di protezione al primo rigenero.
    const imports = startSource
      .split("\n")
      .filter((line) => line.trim().startsWith("import"))
      .join("\n");
    expect(imports).not.toContain("auth-attacher");
    expect(generatedSource).toContain("automatically generated");
  });
});
