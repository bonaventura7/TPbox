import { describe, expect, it } from "vitest";

import { supabaseClientConfigured, SUPABASE_CONFIG_MISSING_MESSAGE } from "./config";

describe("supabaseClientConfigured", () => {
  it("riflette la presenza delle variabili client", () => {
    const configured =
      typeof import.meta.env["VITE_SUPABASE_URL"] === "string" &&
      import.meta.env["VITE_SUPABASE_URL"].trim() !== "" &&
      typeof import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] === "string" &&
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"].trim() !== "";
    expect(supabaseClientConfigured()).toBe(configured);
  });

  it("espone un messaggio diagnostico non vuoto", () => {
    expect(SUPABASE_CONFIG_MISSING_MESSAGE.length).toBeGreaterThan(0);
  });
});
