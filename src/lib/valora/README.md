# Valora Suite — fondazione P0

Fondazione isolata e reversibile: catalogo tipizzato, inspector deterministico,
repository mock e due rotte pubbliche. Nessun fetch esterno (né dal browser né
dal server), nessun segreto, nessuna pubblicazione automatica.

| File                  | Contenuto                                                          |
| --------------------- | ------------------------------------------------------------------ |
| `types.ts`            | Tipi di dominio e contratti delle future tabelle Supabase          |
| `catalog.ts`          | Catalogo tool/dataset/risorse, allowlist host, filtro puro         |
| `inspector.ts`        | Validazione metadati → finding strutturati                         |
| `repository.mock.ts`  | Repository mock, sostituibile da adapter Supabase                  |
| `ha.ts`               | Contratti di resilienza (timeout, backoff, DLQ, idempotenza, log)  |
| `wacc.ts`             | Modulo WACC: funzioni pure, aritmetica in basis point              |
| `valora.test.ts`      | Test di catalogo, inspector, utilità HA e WACC                     |

UI: `src/routes/tool.valora.index.tsx` (dashboard) e `src/routes/tool.valora.wacc.tsx`.

## Dati

I valori numerici sono sintetici e marcati DEMO. La fonte Damodaran è citata come
riferimento metodologico (attribuzione + URL ufficiale): nessuna copia, nessun
iframe, nessuno scraping. Quando la verifica manuale manca, lo stato è `STALE` e
il dato non alimenta alcun calcolo.

## Test

Il progetto non porta un runner di test tra le dipendenze, come già per
`src/lib/amount-b/engine.test.ts`. Per eseguirli:

```
bun add -d vitest
bunx vitest run src/lib/valora/valora.test.ts
```

I file `*.test.ts` sono esclusi da `tsconfig.json`.
