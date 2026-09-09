// Configurazione minima per eseguire i test puri senza caricare vite.config.ts,
// che dipende da @lovable.dev/vite-tanstack-config (non risolvibile qui).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/company-finder/sources/bilanci/*.test.ts"],
  },
});
