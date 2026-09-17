/**
 * Config Vitest separato per evitare il bug Windows in @lovable.dev/mcp-js.
 *
 * @lovable.dev/vite-tanstack-config (nel vite.config.ts principale) carica il plugin
 * mcpPlugin(), che fallisce su Windows perché confronta path con forward slash (C:/)
 * con path che usano backslash (C:\) — l'assert "must resolve under C:/..." non passa.
 * Su Windows, createViteServer non riesce nemmeno a partire.
 *
 * Questo file vitest.config.ts ha priorità totale su vite.config.ts durante l'esecuzione
 * dei test, su TUTTI gli OS (non solo Windows). Vitest carica questo file se esiste,
 * ignorando completamente vite.config.ts. Di conseguenza:
 *
 * - Il runtime di test NON ha: tailwindcss, tanstackStart, nitro, mcpPlugin
 * - Il runtime di test HA: react, vite-tsconfig-paths
 *
 * Questa divergenza è silenziosa: il prossimo sviluppatore che modifica la config di test
 * potrebbe non rendersi conto che questo file scavalca il preset di @lovable.dev.
 *
 * Soluzione a lungo termine: quando @lovable.dev/mcp-js corregge il bug Windows
 * (normalizzare i path a forward slash prima del confronto), si potrà consolidare
 * di nuovo in un unico vite.config.ts e cancellare questo file.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": `${__dirname}/src`,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
