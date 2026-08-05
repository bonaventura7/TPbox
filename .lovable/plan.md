# Lovable Project Plan

## Stato corrente

Progetto React + TypeScript + Vite + Bun, con shadcn/ui e TanStack Router.

## Amount B – Pillar One (OECD)

### Obiettivo

Un percorso guidato che porta l'utente dai dati della società al risultato di conformità, senza mai
mostrare concetti da foglio di calcolo (nessun riferimento a celle, schede, formule).

### Percorsi

```
/tool/amount-b                      indice: cos'è²°, avvia nuovo calcolo, storico
/tool/amount-b/nuovo                procedura guidata (stato nel search param "step")
/tool/amount-b/risultato/$id        cruscotto esito
/tool/amount-b/storico              elenco calcoli salvati
```

Voce "Amount B" aggiunta al menu Tool (header desktop, drawer mobile) e alle card di /tool e Home.

### Procedura guidata — 7 passi

1. **Identificazione entità²°:** denominazione, paese, esercizio, valuta
2. **Ambito di applicazione:** attività di distribuzione, rivendita, agente/commissionario; esclusioni
3. **Dati economici:** ricavi netti, costo del venduto, spese operative, utile operativo
4. **Attivo e capitale:** attivo operativo netto, crediti, rimanenze, debiti commerciali
5. **Classificazione:** gruppo industriale (1/2/3), area geografica, categoria di mercato
6. **Verifiche di soglia:** intensità²° di spese operative, intensità²° di attivo, verifica dei costi
7. **Riepilogo e conferma:** elenco completo dei dati con possibilità di tornare a ogni passo

**Ogni passo:**
- Indicatore di avanzamento (passo N di 7 + barra)
- Validazione bloccante con messaggi in italiano
- Tooltip contestuale su ogni campo tecnico
- Salvataggio automatico della bozza

### Esito (cruscotto)

- **Quattro schede KPI:** rendimento sulle vendite ottenuto, intervallo di riferimento, scostamento, rettifica indicativa
- **Semaforo di conformità:** verde (dentro l'intervallo), ambra (entro la tolleranza operativa), rosso (fuori intervallo) — con motivazione testuale
- **Grafici:** posizione del rendimento rispetto all'intervallo; confronto tra indicatori di intensità²° e le rispettive soglie
- **Pannello "Come si arriva a questo risultato":** passaggi in linguaggio ordinario, con i parametri applicati e la versione della matrice usata
- **Esportazione:** PDF (stampa formattata) ed Excel (foglio dati generato lato server)

### Storico

Elenco dei calcoli con data, entità²°, esercizio, esito e apertura del cruscotto. Bozza in corso evidenziata e ripristinabile.

### Dettagli tecnici

**Motore separato dalla UI.** Nessun componente contiene formule.

- `src/lib/amount-b/parameters.v2024.ts` — dati tabellari: matrice di prezzo per gruppo industriale/intensità²°, soglie di intensità²°, correttivi geografici e di rating creditizio, intervallo (0,5 pp), tolleranza. Un solo export con un campo `version`.
- `src/lib/amount-b/types.ts` — `AmountBInput`, `AmountBOutcome`, `ComplianceStatus`, `EngineTrace` (passaggi spiegabili).
- `src/lib/amount-b/engine.ts` — funzione pura `computeAmountB(input, parameters)`: determina ambito, classifica, calcola gli indicatori, individua la cella della matrice, produce esito e tracciato. Nessuna dipendenza da React.
- `src/lib/amount-b/validation.ts` — schemi zod per passo, riusati dalla UI e dal server.
- `src/lib/amount-b.functions.ts` — `saveAmountBDraft`, `runAmountBCalculation`, `listAmountBCalculations`, `getAmountBCalculation`, `exportAmountBWorkbook`.
- `src/lib/repositories/amount-b.repository.server.ts` — persistenza mock in memoria con correlation ID, audit, timeout e degrado controllato, coerente con gli altri repository.

**Componenti riusabili** in `src/components/amount-b/`:
- `WizardShell` (avanzamento + navigazione)
- `WizardField` (etichetta, tooltip, errore)
- `KpiCard`
- `ComplianceLight`
- `RangeChart`
- `IntensityChart`
- `ExplanationPanel`
- `CalculationHistoryTable`

**Bozza.** Salvataggio automatico differito su `localStorage` per la ripresa immediata e, in parallelo, sul repository lato server; il passo corrente vive nel search param, così il collegamento è condivisibile.

**Sostituibilità²° delle formule.** `computeAmountB` riceve i parametri come argomento; affiancare una versione successiva significa aggiungere `parameters.vXXXX.ts` e selezionarla per esercizio.

Dati dimostrativi marcati come demo, coerentemente con il resto del portale.

### Fasi di implementazione

#### Phase 1 – Discovery e revisione del piano di migrazione

**Output:**
- `docs/amount-b-migration-plan.md`
- `docs/amount-b-workbook-inventory.md`
- `docs/amount-b-calculation-manifest.md`
- `docs/amount-b-unresolved-rules.md`
- `docs/amount-b-golden-test-cases.md`

**Attività²°:**
- Inventario di tutti i worksheet (READ ME, 1 Inputs for scoping, 2 Inputs for pricing, 3 Automated Calculations, Data Table as of January 2026, December 2024, March 2024).
- Distinzione tra versione workbook (February 2026) e versioni data table (2026-01, 2024-12, 2024-03).
- Mappatura formula-per-formula con: foglio, cella, formula Excel, dipendenze, arrotondamento, gestione blank/error.
- Registro delle ambiguità²° e delle regole non completamente specificate.
- Definizione di golden test per ogni ramo decisionale.

#### Phase 2 – Contratto TypeScript e dominio

**Output:**
- `src/lib/amount-b/model.ts` (tipi, contratti, PercentageRange, ecc.)
- `src/lib/amount-b/datasets/registry.ts` (version-aware)
- `src/lib/amount-b/datasets/*/jurisdictions.ts`, `creditRatings.ts`, `products.ts`

**Principi:**
- Dataset versionati (2024-03, 2024-12, 2026-01, ecc.)
- Pricing matrix e lookup tab lives nei dataset, non hardcoded nell'engine.
- Separazione netta tra: scoping quantitativo, valutazione qualitativa, Section 5.1, 5.2, 5.3.

#### Phase 3 – Engine puro, test, UI

**Output:**
- `src/lib/amount-b/engine/*.ts` (pure calculation functions)
- `src/lib/amount-b/engine/*.test.ts` (golden test)
- UI e wizard (solo dopo che engine e test sono verdi)

## Altri task

- Riorganizzazione sezioni "Normativa" e "Attualità²°" nel tool esistente (vedi `.lovable/plan/riorganizzazione-sezioni-normativa-attualit%C3%A0-tool-2026-08-05.md`)
- Osservatorio Transfer Pricing aggiunto alla sezione Tool
