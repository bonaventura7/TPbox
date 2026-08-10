import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Questo file conteneva un test che leggeva `supabase/functions/news-generate/index.ts`.
 * Quella funzione su `main` non è mai esistita: vive su un altro ramo. Il risultato
 * era una suite rossa in permanenza, e una suite sempre rossa non distingue più una
 * regressione nuova dal rumore di fondo — cioè smette di essere un quality gate.
 *
 * L'invariante che il test difendeva resta valido e viene qui generalizzato a tutte
 * le edge function presenti, invece che a un file specifico: nessuna funzione che
 * costruisce un client con la chiave di servizio può essere raggiungibile senza che
 * il chiamante sia stato autorizzato prima. L'autorizzazione può arrivare dal codice
 * (`authorizeCaller` invocato prima di `createClient`) oppure dal gateway
 * (`verify_jwt = true` in `supabase/config.toml`). Una delle due deve esserci.
 */

const FUNCTIONS_DIR = new URL("../supabase/functions", import.meta.url).pathname;
const CONFIG = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

function edgeFunctions(): { name: string; source: string }[] {
  if (!existsSync(FUNCTIONS_DIR)) return [];
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => ({ name: entry.name, path: join(FUNCTIONS_DIR, entry.name, "index.ts") }))
    .filter((fn) => existsSync(fn.path))
    .map((fn) => ({ name: fn.name, source: readFileSync(fn.path, "utf8") }));
}

/** `verify_jwt` dichiarato per quella funzione in config.toml. */
function jwtVerifiedByGateway(name: string): boolean {
  const section = CONFIG.split(`[functions.${name}]`)[1];
  if (section === undefined) return false;
  const body = section.split("\n[")[0] ?? "";
  return /verify_jwt\s*=\s*true/.test(body);
}

const functions = edgeFunctions();

describe("edge function: autorizzazione prima della chiave di servizio", () => {
  it("trova almeno una edge function da controllare", () => {
    expect(functions.map((f) => f.name)).not.toEqual([]);
  });

  it.each(functions.map((f) => [f.name, f.source] as const))(
    "%s non espone la chiave di servizio a un chiamante non autorizzato",
    (name, source) => {
      const serviceClientIndex = source.search(
        /createClient\([^)]*SERVICE_ROLE|createClient\(\s*supabaseUrl\s*,\s*supabaseKey/,
      );
      const usesServiceRole = source.includes("SERVICE_ROLE_KEY");
      if (!usesServiceRole) return;

      const authIndex = source.indexOf("await authorizeCaller(");
      const authorizedInCode = authIndex >= 0 && authIndex < serviceClientIndex;

      expect(
        authorizedInCode || jwtVerifiedByGateway(name),
        `${name} costruisce un client service-role senza autorizzare il chiamante ` +
          `né in codice né tramite verify_jwt in config.toml`,
      ).toBe(true);
    },
  );

  it.each(functions.map((f) => [f.name, f.source] as const))(
    "%s, se autorizza in codice, lo fa prima di qualunque chiamata al modello",
    (_name, source) => {
      const authIndex = source.indexOf("await authorizeCaller(");
      const llmIndex = source.indexOf("await generate(");
      if (authIndex < 0 || llmIndex < 0) return;

      expect(authIndex).toBeLessThan(llmIndex);
    },
  );
});
