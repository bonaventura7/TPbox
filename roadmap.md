# Roadmap

## In corso — Hungary Company Finder (piano approvato in `.lovable/plan.md`)

- [ ] RED: `test/company-finder-hu.test.ts` + `test/company-finder-document-resolver.test.ts`
- [ ] GREEN: contratto `RegistryAdapter` + adapter HU e-Beszámoló (REGISTRY_ONLY / CAPTCHA_REQUIRED, nessun bypass ALTCHA)
- [ ] GREEN: correzioni `countries.ts`, `coverage.ts` (livello browser-only), `official-pages.ts` (ramo HU), `types.ts`, `orchestrator.ts` (HU fuori dal VIES se non IVA)
- [ ] GREEN: resolver documenti interno + hardening condiviso (allowlist esatta, https, SSRF/redirect, timeout, retry 3 con backoff+jitter, circuit breaker, size/content-type/magic bytes, SHA-256, provenance, correlationId, token opaco)
- [ ] GREEN: route `/api/company-finder/financial-document` + UI lista bilanci e stato (niente iframe HU)
- [ ] REFACTOR: proxy legacy sulle stesse validazioni, senza cambi di comportamento per DE/NL/DK/UK/FR/GR/BE/PL
- [ ] Verifiche: suite vitest completa, typecheck, build

## Vincoli fissi

- Nessuna modifica a Supabase/schema.
- Nessuna nuova dipendenza.
- Nessun hardcoding dei parametri `b`/`so`/`o` del portale HU.
