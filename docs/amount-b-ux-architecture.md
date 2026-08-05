# Tool "Amount B" (Pillar One) — Architettura UX e Motore di Calcolo

## Nota sul file allegato

Il workbook OECD non è arrivato con il messaggio (la cartella degli allegati è vuota). Procedo
implementando il motore secondo la metodologia pubblicata dell'Approccio Semplificato e
Razionalizzato (Amount B), con tutti i parametri isolati in un unico file di configurazione
versionato. Quando il file arriva, l'unica cosa da sostituire sono le tabelle di quel file: nessuna
modifica a UI, routing o servizi. Se preferisci, ricarica il workbook prima che io inizi.

## Obiettivo

Un percorso guidato che porta l'utente dai dati della società al risultato di conformità, senza mai
mostrare concetti da foglio di calcolo (nessun riferimento a celle, schede, formule).

## Percorsi

```
/tool/amount-b                      indice: cos'è²°, avvia nuovo calcolo, storico
/tool/amount-b/nuovo                procedura guidata (stato nel search param "step")
/tool/amount-b/risultato/$id        cruscotto esito
/tool/amount-b/storico              elenco calcoli salvati
```

Voce "Amount B" aggiunta al menu Tool (header desktop, drawer mobile) e alle card di /tool e Home.

## Procedura guidata — 7 passi

### 1. Identificazione entità²°
- Denominazione, paese, esercizio, valuta.

### 2. Ambito di applicazione
- Attività di distribuzione, rivendita, agente/commissionario
- Esclusioni (beni non materiali, servizi, commodity, attività non di routine)

### 3. Dati economici
- Ricavi netti, costo del venduto, spese operative, utile operativo

### 4. Attivo e capitale
- Attivo operativo netto, crediti, rimanenze, debiti commerciali

### 5. Classificazione
- Gruppo industriale (1/2/3), area geografica, categoria di mercato
- Disponibilità del rating creditizio

### 6. Verifiche di soglia
- Intensità²° di spese operative, intensità²° di attivo, verifica dei costi

### 7. Riepilogo e conferma
- Elenco completo dei dati con possibilità di tornare a ogni passo

**Ogni passo:**
- Indicatore di avanzamento (passo N di 7 + barra)
- Validazione bloccante con messaggi in italiano
- Tooltip contestuale su ogni campo tecnico
- Salvataggio automatico della bozza

## Esito (cruscotto)

### Quattro schede KPI
- Rendimento sulle vendite ottenuto
- Intervallo di riferimento
- Scostamento
- Rettifica indicativa

### Semaforo di conformità
- **Verde:** dentro l'intervallo
- **Ambra:** entro la tolleranza operativa
- **Rosso:** fuori intervallo
- Con motivazione testuale

### Grafici
- Posizione del rendimento rispetto all'intervallo
- Confronto tra indicatori di intensità²° e le rispettive soglie
- Componenti `chart.tsx` già presenti

### Pannello "Come si arriva a questo risultato"
- Passaggi in linguaggio ordinario
- Parametri applicati
- Versione della matrice usata

### Esportazione
- **PDF:** stampa formattata
- **Excel:** foglio dati generato lato server

## Storico

Elenco dei calcoli con:
- Data
- Entità²°
- Esercizio
- Esito
- Apertura del cruscotto

Bozza in corso evidenziata e ripristinabile.

## Dettagli tecnici

### Motore separato dalla UI

Nessun componente contiene formule.

**`src/lib/amount-b/parameters.v2024.ts`**
- Dati tabellari: matrice di prezzo per gruppo industriale/intensità²°, soglie di intensità²°, correttivi geografici e di rating creditizio, intervallo (0,5 pp), tolleranza
- Un solo export con un campo `version`

**`src/lib/amount-b/types.ts`**
- `AmountBInput`
- `AmountBOutcome`
- `ComplianceStatus`
- `EngineTrace` (passaggi spiegabili)

**`src/lib/amount-b/engine.ts`**
- Funzione pura `computeAmountB(input, parameters)`
- Determina ambito, classifica, calcola gli indicatori
- Individua la cella della matrice
- Produce esito e tracciato
- Nessuna dipendenza da React

**`src/lib/amount-b/validation.ts`**
- Schemi zod per passo, riusati dalla UI e dal server

**`src/lib/amount-b.functions.ts`**
- `saveAmountBDraft`
- `runAmountBCalculation`
- `listAmountBCalculations`
- `getAmountBCalculation`
- `exportAmountBWorkbook`

**`src/lib/repositories/amount-b.repository.server.ts`**
- Persistenza mock in memoria con correlation ID, audit, timeout e degrado controllato
- Coerente con gli altri repository

### Componenti riusabili

In `src/components/amount-b/`:
- `WizardShell` (avanzamento + navigazione)
- `WizardField` (etichetta, tooltip, errore)
- `KpiCard`
- `ComplianceLight`
- `RangeChart`
- `IntensityChart`
- `ExplanationPanel`
- `CalculationHistoryTable`

### Bozza

Salvataggio automatico differito:
- Su `localStorage` per la ripresa immediata
- In parallelo, sul repository lato server
- Il passo corrente vive nel search param, così il collegamento è condivisibile

### Sostituibilità²° delle formule

`computeAmountB` riceve i parametri come argomento; affiancare una
versione successiva significa aggiungere `parameters.vXXXX.ts` e selezionarla per esercizio.

Dati dimostrativi marcati come demo, coerentemente con il resto del portale.

## Fasi di implementazione

### Phase 1 – Discovery e revisione del piano di migrazione

**Output:**
- `docs/amount-b-migration-plan.md` (già²° esistente)
- `docs/amount-b-workbook-inventory.md` (già²° esistente)
- `docs/amount-b-calculation-manifest.md` (già²° esistente)
- `docs/amount-b-unresolved-rules.md` (già²° esistente)
- `docs/amount-b-golden-test-cases.md` (già²° esistente)

**Attività²°:**
- Inventario di tutti i worksheet (READ ME, 1 Inputs for scoping, 2 Inputs for pricing, 3 Automated Calculations, Data Table as of January 2026, December 2024, March 2024)
- Distinzione tra versione workbook (February 2026) e versioni data table (2026-01, 2024-12, 2024-03)
- Mappatura formula-per-formula con: foglio, cella, formula Excel, dipendenze, arrotondamento, gestione blank/error
- Registro delle ambiguità²° e delle regole non completamente specificate
- Definizione di golden test per ogni ramo decisionale

### Phase 2 – Contratto TypeScript e dominio

**Output:**
- `src/lib/amount-b/model.ts` (tipi, contratti, PercentageRange, ecc.)
- `src/lib/amount-b/datasets/registry.ts` (version-aware)
- `src/lib/amount-b/datasets/*/jurisdictions.ts`, `creditRatings.ts`, `products.ts`

**Principi:**
- Dataset versionati (2024-03, 2024-12, 2026-01, ecc.)
- Pricing matrix e lookup tab lives nei dataset, non hardcoded nell'engine
- Separazione netta tra: scoping quantitativo, valutazione qualitativa, Section 5.1, 5.2, 5.3

### Phase 3 – Engine puro, test, UI

**Output:**
- `src/lib/amount-b/engine/*.ts` (pure calculation functions)
- `src/lib/amount-b/engine/*.test.ts` (golden test)
- UI e wizard (solo dopo che engine e test sono verdi)

## Riferimenti

- OECD, "Pricing Automation Tool for The Simplified and Streamlined Approach", February 2026
- File Excel: `pillar-one-amount-b-pricing-automation-tool-february-2026.xlsx` [file:69]
- Documentation: `docs/amount-b-*.md`
