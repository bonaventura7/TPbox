// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Company Finder interroga i registri europei in parallelo, con timeout per
// fonte fino a 15 s. Il default di Vercel per una funzione Node troncherebbe la
// ricerca a meta', quindi la durata massima va alzata a 30 s.
//
// `vercel.functions.maxDuration` non compare nei tipi di
// @lovable.dev/vite-tanstack-config, che espone solo preset/output/cloudflare,
// ma l'oggetto viene inoltrato tal quale a Nitro: il preset vercel lo scrive in
// .vercel/output/functions/__server.func/.vc-config.json. Verificato sull'output
// di build ("maxDuration": 30). Da qui l'annotazione allargata, l'unico modo di
// passare l'opzione senza rinunciare al typecheck.
const nitroVercel: NonNullable<NonNullable<Parameters<typeof defineConfig>[0]>["nitro"]> & {
  vercel: { functions: { maxDuration: number } };
} = {
  preset: "vercel",
  output: {
    dir: ".vercel/output",
    serverDir: ".vercel/output/functions/__server.func",
    publicDir: ".vercel/output/static",
  },
  vercel: { functions: { maxDuration: 30 } },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Su Vercel (VERCEL=1) Nitro deve usare il preset "vercel" (Build Output API v3).
  // Il default del config e' cloudflare: su Vercel ogni route risponderebbe 404.
  // La condizione mantiene invariato il comportamento su Lovable/Cloudflare.
  nitro: process.env["VERCEL"] ? nitroVercel : false,
  vite: {
    plugins: [mcpPlugin()],
  },
});
