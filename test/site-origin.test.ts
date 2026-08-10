import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { SITE_ORIGIN, canonicalUrl } from "../src/lib/platform/site";

/**
 * Il dominio pubblico è cambiato: `transfer-guide-italia.lovable.app` risponde 404,
 * il portale vive su `tp-box.lovable.app`. Nel codice erano rimasti otto riferimenti
 * al vecchio indirizzo, di cui sei dentro `canonical` e `og:url`: metadati che
 * dichiarano ai motori di ricerca quale sia l'indirizzo autorevole di una pagina.
 * Puntarli a un 404 è un invito alla deindicizzazione.
 *
 * Questi test difendono due cose: che il vecchio dominio non ricompaia da nessuna
 * parte, e che l'origine sia scritta in un punto solo — perché la causa del guasto
 * non è stata l'errore in sé, ma il fatto che andasse corretto in otto file.
 */

const DEAD_HOST = "transfer-guide-italia.lovable.app";
const SRC = new URL("../src", import.meta.url).pathname;
const ORIGIN_FILE = join(SRC, "lib", "platform", "site.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("origine pubblica del portale", () => {
  const files = sourceFiles(SRC);

  it("trova dei sorgenti da controllare", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("il dominio morto non compare in nessun sorgente", () => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes(DEAD_HOST));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it("l'host pubblico è scritto solo in site.ts", () => {
    const host = new URL(SITE_ORIGIN).host;
    const offenders = files
      .filter((file) => file !== ORIGIN_FILE)
      .filter((file) => readFileSync(file, "utf8").includes(host));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it("la configurazione Supabase non rimanda al dominio morto", () => {
    const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
    expect(config).not.toContain(DEAD_HOST);
    expect(config).toContain(SITE_ORIGIN);
  });
});

describe("canonicalUrl", () => {
  it("compone un assoluto a partire dal percorso", () => {
    expect(canonicalUrl("/tool/amount-b")).toBe(`${SITE_ORIGIN}/tool/amount-b`);
  });

  it("la radice non porta lo slash finale", () => {
    expect(canonicalUrl("/")).toBe(SITE_ORIGIN);
  });

  it("normalizza lo slash finale", () => {
    expect(canonicalUrl("/tool/beps-mli/")).toBe(`${SITE_ORIGIN}/tool/beps-mli`);
  });

  it("rifiuta un percorso relativo invece di comporre un URL sbagliato", () => {
    expect(() => canonicalUrl("tool/amount-b")).toThrow(/percorso assoluto/);
  });
});
