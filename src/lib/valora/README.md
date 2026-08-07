# Valora Suite — fondazione P0

Fondazione isolata e reversibile: catalogo tipizzato, inspector deterministico,
repository mock e due rotte pubbliche. Nessun fetch esterno (né dal browser né
dal server), nessun segreto, nessuna pubblicazione automatica.

| File                  | Contenuto                                                          |
| --------------------- | ------------------------------------------------------------------ |
| `types.ts`            | Tipi di dominio e contratti delle future tabelle Supabase          |
| `catalog.ts`          | Catalogo tool/dataset/risorse, allowlist host, filtro puro         |
| `validator.ts`        | Validazione metadati → finding strutturati                         |
| `repository.mock.ts`  | Repository mock, sostituibile da adapter Supabase                  |
| `resilience.contracts.ts`               | Contratti di resilienza (timeout, backoff, DLQ, idempotenza, log)  |
| `wacc.ts`             | Modulo WACC: funzioni pure, aritmetica in basis point              |
| `valora.test.ts`      | Test di catalogo, inspector, utilità HA e WACC                     |

UI: `src/routes/tool.valora.index.tsx` (dashboard) e `src/routes/tool.valora.wacc.tsx`.

## Primary source policy

Valora espone soltanto fonti primarie, autorevoli e tracciabili (organismi
internazionali, istituzioni UE, autorità nazionali). Nessun prodotto, sito, brand
o persona di terzi viene nominato, replicato o incorporato: né in UI, né nei dati
demo, né nei commenti.

Ogni fonte dichiara `primarySourceName`, `canonicalUrl` (HTTPS su allowlist),
`sourceDateOrVersion`, `lastVerifiedAt`, `status`, `permittedUse`, `limitations`
e `professionalNotice`. Quando una data non è disponibile la UI mostra
"non disponibile": nessun valore viene stimato o inventato.

La discovery secondaria esiste solo come nota interna (`VALORA_INTERNAL_DISCOVERY`,
`exposed: false`, `feedsData: false`): non è esposta e non alimenta dati o calcoli.

I valori numerici sono sintetici e marcati DEMO. Nessun iframe, scraping, fetch dal
browser o pubblicazione automatica.

## Test

Il progetto non porta un runner di test tra le dipendenze, come già per
`src/lib/amount-b/engine.test.ts`. Per eseguirli:

```
bun add -d vitest
bunx vitest run src/lib/valora/valora.test.ts
```

I file `*.test.ts` sono esclusi da `tsconfig.json`.
