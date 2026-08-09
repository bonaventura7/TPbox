import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FUNCTIONS = ["news-scout", "news-generate", "news-publish", "news-monitor"] as const;

function source(name: string) {
  return readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
}

const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

/**
 * Static guard. Every edge function holds the service-role key, so an unauthenticated
 * caller who reaches the handler is already privileged. Two independent layers must be
 * declared for each of them: verify_jwt at the platform boundary, and an explicit caller
 * identity check in the handler. verify_jwt alone is not enough — the anon key is a valid
 * JWT and it ships in the frontend bundle.
 *
 * This is asserted on the source text rather than by invoking the handlers because the
 * property being defended is the ordering of the operations, not their outcome.
 */
describe("edge function authorization", () => {
  for (const name of FUNCTIONS) {
    it(`${name} authorizes the caller before creating a service-role client`, () => {
      const text = source(name);
      const authIndex = text.indexOf("await authorizeCaller(");
      const serviceClientIndex = text.indexOf("SERVICE_KEY)");

      expect(authIndex, `${name} never calls authorizeCaller`).toBeGreaterThanOrEqual(0);
      expect(
        serviceClientIndex,
        `${name} never builds a service-role client`,
      ).toBeGreaterThanOrEqual(0);
      expect(authIndex, `${name} builds the service-role client before authorizing`).toBeLessThan(
        serviceClientIndex,
      );
    });

    it(`${name} checks an explicit expected caller id`, () => {
      expect(source(name)).toMatch(/Deno\.env\.get\('NEWS_[A-Z]+_CALLER_USER_ID'\)/);
    });

    it(`${name} declares verify_jwt in config.toml`, () => {
      expect(config).toContain(`[functions.${name}]`);
      const block = config.slice(config.indexOf(`[functions.${name}]`));
      expect(block.slice(0, block.indexOf("\n\n"))).toContain("verify_jwt = true");
    });
  }
});
