# Strumenti del Portale — Overview

## Panoramica

Questo documento elenca tutti gli strumenti disponibili nel portale, con descrizione, stato e link alla documentazione tecnica.

## Strumenti Implementati

### 1. Amount B (Pillar One)

**Route:** `/tool/amount-b`  
**Stato:** Phase 1 completata (Discovery e documentazione)  
**Icona:** `Calculator`  

**Descrizione:**
Strumento di calcolo per l'Approccio Semplificato e Razionalizzato (Amount B) del Pillar One OECD. Procedura guidata 7 passi che porta l'utente dai dati della società al risultato di conformità.

**Funzionalità²°:**
- Wizard 7 passi (identificazione, ambito, dati economici, attivo, classificazione, verifiche, riepilogo)
- Cruscotto esito con KPI, semaforo conformità, grafici
- Storico calcoli salvati
- Esportazione PDF/Excel

**Documentazione:**
- `docs/amount-b-ux-architecture.md` — Architettura UX completa
- `docs/amount-b-migration-plan.md` — Piano di migrazione
- `docs/amount-b-workbook-inventory.md` — Inventario workbook OECD
- `docs/amount-b-calculation-manifest.md` — Manifest formule e regole
- `docs/amount-b-unresolved-rules.md` — Ambiguities e regole aperte
- `docs/amount-b-golden-test-cases.md` — Golden test cases

**Roadmap:**
- Phase 1 ✅: Discovery e documentazione
- Phase 2 ⏳: Contratto TypeScript e dominio
- Phase 3 ⏳: Engine, test e UI

---

### 2. BEPS MLI Database

**Route:** `/tool/beps-mli`  
**Stato:** Phase 1 in corso (Discovery e documentazione)  
**Icona:** `Database`  

**Descrizione:**
Database interattivo per analizzare l'impatto del BEPS Multilateral Instrument sui trattati fiscali bilaterali. Integrazione del database OECD con UI migliorata, spiegazioni in italiano e branding coerente.

**Funzionalità²°:**
- Matching tra paesi
- Ricerca avanzata con filtri
- Statistiche aggregate
- Dettaglio reservations e choices per paese
- Esportazione CSV/Excel

**Documentazione:**
- `docs/beps-mli-integration.md` — Architettura e piano di integrazione

**Roadmap:**
- Phase 1 ⏳: Discovery e design
- Phase 2 ⏳: Backend e dati
- Phase 3 ⏳: Frontend UI
- Phase 4 ⏳: Rifiniture

---

### 3. Osservatorio Transfer Pricing

**Route:** Esterna (https://f7dc1dde-25ee-4227-8806-f31498244695.lovableproject.com/)  
**Stato:** Implementato  
**Icona:** `ExternalLink`  

**Descrizione:**
Portale indipendente con fonti e strumenti per il transfer pricing.

---

### 4. Company Finder

**Route:** `/tool/company-finder`  
**Stato:** Implementato  
**Icona:** `Building`  

**Descrizione:**
Identifica una società e scarica il bilancio in forma dimostrativa. Ricerca per ragione sociale o numero di partita IVA.

---

### 5. Portale Interpelli

**Route:** `/normativa/portale-interpelli`  
**Stato:** Implementato  
**Icona:** `ExternalLink`  

**Descrizione:**
Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate.

---

### 6. Currency-Adjusted Benchmark

**Route:** `/tool/currency-benchmark`  
**Stato:** operativo  
**Icona:** `ArrowLeftRight`  

**Descrizione:**
Converte le osservazioni di un benchmark nella valuta della transazione e ricalcola il range interquartile. Due metodi: differenziale dei tassi di riferimento governativi alla stessa scadenza, oppure aggiustamento manuale in basis point. Ogni riga riporta la base di calcolo, la provenienza dei tassi usati e lo stato del dato; le righe che non si possono convertire restano bloccate con il motivo.

**Documentazione:** `docs/currency-benchmark-manifest.md`

---

### 7. Dati di mercato

**Route:** `/tool/market-data` — API: `GET /api/market-data`  
**Stato:** operativo  
**Icona:** `Activity`  

**Descrizione:**
Cruscotto dei dati di mercato usati dagli strumenti: cambi di riferimento BCE con cross rate calcolato dalle due gambe in euro, curve dei rendimenti, Euribor, tassi bancari sulle nuove operazioni, Treasury, spread creditizi ICE BofA e country risk premium Damodaran. Le fonti sono interrogate dal server, mai dal browser, con dataset congelato come riserva e stato del dato dichiarato voce per voce.

**Documentazione:** `docs/currency-benchmark-manifest.md`

---

## Strumenti in Piano

### 8. Country Profiles

**Route:** `/tool/country-profiles` (pianificata)  
**Stato:** Da implementare  

**Descrizione:**
Profilo per paese con normative, trattati, e dati specifici.

---

## Tabella Riassuntiva

| Strumento | Route | Stato | Icona | Documentazione |
|-----------|-------|-------|-------|----------------|
| Amount B | `/tool/amount-b` | Phase 1 ✅ | `Calculator` | 6 file docs |
| BEPS MLI | `/tool/beps-mli` | Phase 1 ⏳ | `Database` | 1 file docs |
| Osservatorio TP | Esterno | Implementato | `ExternalLink` | - |
| Company Finder | `/tool/company-finder` | Implementato | `Building` | - |
| Portale Interpelli | `/normativa/portale-interpelli` | Implementato | `ExternalLink` | - |
| Country Profiles | `/tool/country-profiles` | Pianificato | `Globe` | - |
| Currency-Adjusted Benchmark | `/tool/currency-benchmark` | Operativo | `ArrowLeftRight` | 1 file docs |
| Dati di mercato | `/tool/market-data` | Operativo | `Activity` | 1 file docs |

## Note per Sviluppatori

- Ogni strumento dovrebbe avere documentazione in `docs/`
- Le route seguono il pattern `/tool/[nome-tool]`
- Icone: usare `lucide-react` per coerenza
- Stati: Phase 1 (Discovery), Phase 2 (Backend), Phase 3 (UI), Phase 4 (Rifiniture)

## Link Utili

- [Lovable Project](https://lovable.dev/projects/f7dc1dde-25ee-4227-8806-f31498244695)
- [GitHub Repo](https://github.com/bonaventura7/transfer-guide-italia)
