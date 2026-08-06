# Lovable Project Plan

## Stato corrente

Progetto React + TypeScript + Vite + Bun, con shadcn/ui e TanStack Router.

## Strumenti implementati

### Amount B – Pillar One (OECD)

**Route:** `/tool/amount-b`

**Stato:** completato e operativo. Motore di calcolo, dataset versionati, golden test e
interfaccia guidata.

- Dataset estratti dal workbook: 214 giurisdizioni per ciascuna data table (marzo 2024,
  dicembre 2024, gennaio 2026), scala rating-NRA, matrice di pricing 5x3, fasce cap e
  collar, 34 prodotti con relativo industry grouping. Ogni run registra versioni e
  checksum.
- Motore in `src/lib/amount-b/engine.ts`, funzioni pure, con i riferimenti alle celle
  del workbook nei commenti.
- 26 golden test: il campione Japan del workbook torna su tutti i valori intermedi.
- Interfaccia: scheda dello strumento su `/tool/amount-b`, procedura guidata in cinque
  passi su `/tool/amount-b/nuovo`, precompilata con il campione OCSE.
- Corretti due errori della discovery: mancava la media dei saldi patrimoniali e il cap
  della Section 5.2 era indicato come valore unico. Dettaglio in
  `docs/amount-b-unresolved-rules.md`.

**Documentazione:**
- `src/lib/amount-b/README.md`
- `docs/amount-b-ux-architecture.md`
- `docs/amount-b-migration-plan.md`
- `docs/amount-b-workbook-inventory.md`
- `docs/amount-b-calculation-manifest.md`
- `docs/amount-b-unresolved-rules.md`
- `docs/amount-b-golden-test-cases.md`

### BEPS MLI Database (OECD)

**Route:** `/tool/beps-mli`

**Stato:** Phase 1 (Discovery e documentazione) in corso.

**Obiettivo:** Integrare il BEPS MLI Matching Database OECD con UI migliorata, spiegazioni in italiano e branding coerente con il portale.

**Documentazione:**
- `docs/beps-mli-integration.md`

**Roadmap:**
- Phase 1: Discovery e design
- Phase 2: Backend e dati
- Phase 3: Frontend UI
- Phase 4: Rifiniture

### Altri tool

### Ravvedimento spontaneo

**Route:** `/tool/ravvedimento`

**Stato:** Phase 2 implementata (engine + dataset versionati + UI).

**Decisioni fissate:**
- Convenzione giorni: giorno iniziale escluso, giorno di versamento incluso.
- Divisore: giorni effettivi dell'anno civile (365/366).
- Aritmetica in centesimi, arrotondamento per segmento e sul totale.
- Copertura dataset tassi legali 1997–2025: fuori intervallo il calcolo è bloccato.
- Nessuna maggiorazione 0,5% automatica; ruleset sanzionatorio versionato e marcato `unverified`.
- Cause ostative → calcolo bloccato.

- **Osservatorio Transfer Pricing:** https://f7dc1dde-25ee-4227-8806-f31498244695.lovableproject.com/
- **Company Finder:** `/tool/company-finder`
- **Portale interpelli:** `/normativa/portale-interpelli`

## Altri task

- Riorganizzazione sezioni "Normativa" e "Attualità²°" nel tool esistente
