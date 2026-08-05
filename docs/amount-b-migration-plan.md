# Amount B Migration Plan

## Obiettivo

Migrare la logica del workbook OECD "Pricing Automation Tool for the Simplified and Streamlined Approach (February 2026 version)" in un'applicazione web manutenibile, version-aware e testabile.

## Fasi

### Phase 1 – Discovery e revisione del piano di migrazione

Output:
- `docs/amount-b-workbook-inventory.md`
- `docs/amount-b-calculation-manifest.md`
- `docs/amount-b-unresolved-rules.md`
- `docs/amount-b-golden-test-cases.md`

Attività··
- Inventario di tutti i worksheet (READ ME, 1 Inputs for scoping, 2 Inputs for pricing, 3 Automated Calculations, Data Table as of January 2026, December 2024, March 2024).
- Distinzione tra versione workbook (February 2026) e versioni data table (2026-01, 2024-12, 2024-03).
- Mappatura formula-per-formula con: foglio, cella, formula Excel, dipendenze, arrotondamento, gestione blank/error.
- Registro delle ambiguità··e delle regole non completamente specificate.
- Definizione di golden test per ogni ramo decisionale.

### Phase 2 – Contratto TypeScript e dominio

Output:
- `src/lib/amount-b/model.ts` (tipi, contratti, PercentageRange, ecc.)
- `src/lib/amount-b/datasets/registry.ts` (version-aware)
- `src/lib/amount-b/datasets/*/jurisdictions.ts`, `creditRatings.ts`, `products.ts`

Principi:
- Dataset versionati (2024-03, 2024-12, 2026-01, ecc.)
- Pricing matrix e lookup tab lives nei dataset, non hardcoded nell'engine.
- Separazione netta tra: scoping quantitativo, valutazione qualitativa, Section 5.1, 5.2, 5.3.

### Phase 3 – Engine puro, test, UI

Output:
- `src/lib/amount-b/engine/*.ts` (pure calculation functions)
- `src/lib/amount-b/engine/*.test.ts` (golden test)
- UI e wizard (solo dopo che engine e test sono verdi)

## Quality gate Phase 1

- [ ] Inventario di tutti e sette i worksheet
- [ ] Distinzione tra versione workbook e data table
- [ ] Formula con riferimenti alle celle sorgente
- [ ] Regola per blank, zero ed errori
- [ ] Arrotondamento e precisione
- [ ] Semantica esatta del guardrail a 90 giorni
- [ ] De minimis multi-industry del 20%
- [ ] OAS cap all'85%
- [ ] Mapping rating sovrano → NRA
- [ ] Distinzione fra scoping quantitativo e valutazione qualitativa
- [ ] Golden test per ogni ramo decisionale
- [ ] Checksum dei dataset estratti
- [ ] Registro delle ambiguità··non risolte
