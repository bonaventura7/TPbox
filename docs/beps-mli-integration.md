# BEPS MLI Integration — Architettura e Piano di Integrazione

## Obiettivo

Integrare il **BEPS MLI Matching Database** OECD nel portale in modo che:
1. Sembri un valore aggiunto del sito (non un semplice link a OECD)
2. abbia un design più user-friendly e intuitivo
3. offra spiegazioni contestuali in italiano
4. mantenga coerenza con il branding del portale

## Fonte dati

- **BEPS MLI Matching Database:** https://www.oecd.org/en/data/tools/beps-mli-matching-database.html
- **BEPS MLI Overview:** https://www.oecd.org/en/topics/beps-multilateral-instrument.html
- **MLI Positions (Signatories and Parties):** https://www.oecd.org/content/dam/oecd/en/topics/policy-sub-issues/beps-mli/beps-mli-signatories-and-parties.pdf
- **Posizione Italia:** https://www.oecd.org/content/dam/oecd/en/topics/policy-sub-issues/beps-mli/beps-mli-position-italy.pdf
- **Posizione Germania:** https://www.oecd.org/content/dam/oecd/en/topics/policy-sub-issues/beps-mli/beps-mli-position-germany.pdf

## Strategia di integrazione

### Opzione A (Raccomandata) - API Layer + UI Custom

Creare un layer di astrazione che:
- Fa fetch dei dati da OECD (backend o funzioni server)
- Li normalizza in un formato interno
- Li serve alla UI custom con branding del portale
- Permette di aggiungere valore (spiegazioni, filtri avanzati, export)

**Vantaggi:**
- Controllo totale su UI/UX
- Possibilità di caching e ottimizzazione
- Indipendenza da cambiamenti OECD (se il layer è ben progettato)
- Possibilità di arricchire i dati con spiegazioni in italiano

**Svantaggi:**
- Richiede sviluppo backend
- Manutenzione se OECD cambia struttura

### Opzione B (Workaround rapido) - Wrapper con Overlay

Creare una pagina wrapper che:
- Usa iframe o embed della pagina OECD
- Aggiunge header, footer, navigation del portale
- Aggiunge search bar e filtri custom sopra l'iframe
- Maschera il branding OECD

**Vantaggi:**
- Implementazione rapida
- Poco codice

**Svantaggi:**
- Dipendenza totale da OECD
- Possibili problemi di CORS/embedding
- Meno controllo su UX

### Opzione C (Ibrida) - Dataset Statico + UI Custom

- Scaricare i dati OECD periodicamente
- Creare dataset statici JSON/TS nel repo
- Servire con UI custom
- Aggiornare manualmente o con script automatizzato

**Vantaggi:**
- Controllo totale su UI
- Nessun problema di CORS o embedding
- Performance ottimali

**Svantaggi:**
- Dati non in tempo reale
- Richiede processo di aggiornamento

## Architettura raccomandata

### Route

```
/tool/beps-mli                    indice: cos'è, avvia ricerca, statistiche
/tool/beps-mli/ricerca            interfaccia di ricerca con filtri
/tool/beps-mli/risultato/$id      matching outcomes tra due paesi
/tool/beps-mli/paese/$id          dettaglio paese (reservations, choices)
/tool/beps-mli/statistiche        dashboard aggregate statistics
```

### Componenti

**`src/components/beps-mli/`:**
- `CountrySelector` — dropdown con search per selezionare paesi
- `MatchingTable` — tabella risultati matching
- `ReservationsPanel` — elenco reservations e choices
- `StatisticsDashboard` — grafici e KPI aggregate
- `MliExplanationPanel` — spiegazioni contestuali in italiano
- `ExportButton` — export CSV/Excel

**`src/lib/beps-mli/`:**
- `types.ts` — tipi TypeScript per dati OECD
- `api.ts` — funzioni per fetch dati (backend o statici)
- `utils.ts` — utility per formattazione, filtraggio

### Dati

**Struttura dati normalizzata:**

```ts
interface MliJurisdiction {
  code: string; // es. "ITA"
  nameEn: string;
  nameIt: string;
  isSignatory: boolean;
  isParty: boolean;
  signatureDate?: string;
  entryIntoForceDate?: string;
}

interface CoveredTaxAgreement {
  id: string;
  jurisdiction1: string;
  jurisdiction2: string;
  title: string;
  statusAsOf: string;
}

interface MliProvision {
  article: string;
  provisionType: string;
  minimumStandard: boolean;
  outcome: 'APPLIES' | 'DOES_NOT_APPLY' | 'PARTIAL' | 'PENDING';
  explanationIt: string;
}

interface MatchingOutcome {
  agreementId: string;
  jurisdiction1: string;
  jurisdiction2: string;
  statusAsOf: string;
  provisions: MliProvision[];
}

interface AggregateStats {
  statusAsOf: string;
  totalJurisdictions: number;
  totalCoveredAgreements: number;
  matchedAgreements: number;
  oneWayAgreements: number;
  waitingAgreements: number;
}
```

## UI/UX migliorata

Rispetto a OECD:

1. **Search più intelligente:**
   - Autocomplete per paesi
   - Filtri multipli (azione, minimum, data)
   - Ricerca fuzzy

2. **Visualizzazione chiara:**
   - Card invece di tabelle dense
   - Color coding per provision type
   - Tooltip su ogni termine tecnico

3. **Spiegazioni in italiano:**
   - Ogni provision ha spiegazione contestuale
   - Glossario integrato
   - Esempi pratici

4. **Export e salvataggio:**
   - Export CSV/Excel
   - Salvataggio ricerche preferite
   - Condivisione link con parametri

5. **Dashboard statistiche:**
   - Grafici interattivi
   - Filtri per regione, data, provision
   - Trend temporali

## ETL Pipeline (MLI Positions → Dataset interno)

### Obiettivo

Convertire le MLI Positions OECD (PDF) in dataset interni JSON/TS, in modo semi-automatico, per alimentare il BEPS MLI Database del portale.

### Fonti

- **MLI Signatories and Parties (tabella riepilogo):** lista giurisdizioni, stato, linkage alle posizioni dettagliate. [beps-mli-signatories-and-parties.pdf]
- **Posizione Italia (beps-mli-position-italy.pdf):** elenco trattati notificati (Covered Tax Agreements) e reservations/notifiche.
- **Posizione Germania (beps-mli-position-germany.pdf):** idem per Germania.
- Altri paesi: file posizione analoghi.

### Passi ETL (concept)

1. **Extract (offline / script):**
   - Script Python (es. in una cartella `/etl`) che:
     - Legge PDF MLI Positions (Italia, Germania, etc.)
     - Estrae tabelle di trattati notificati (CTA) e informazioni chiave.
   - Output: CSV/JSON grezzi con:
     - `jurisdiction`, `code`, `isSignatory`, `isParty`
     - `coveredAgreements` (lista di trattati, controparti, titoli)
     - `reservations` e `notifications` per articoli chiave.

2. **Transform:**
   - Convertire CSV/JSON grezzi nei tipi TypeScript (`MliJurisdiction`, `CoveredTaxAgreement`, `MliProvision`, `MatchingOutcome`).
   - Normalizzare codici paese (ISO-3166, es. ITA, FRA, DEU, ESP).
   - Mappare articoli MLI e tipi di provision (6, 7, 9, 13, etc.).

3. **Load:**
   - Salvare dataset finali in:
     - `public/data/beps-mli/jurisdictions-YYYY-MM-DD.json`
     - `public/data/beps-mli/agreements-YYYY-MM-DD.json`
     - `public/data/beps-mli/matching-outcomes-YYYY-MM-DD.json`
   - Versionare per "Status as of" (data snapshot).

4. **Serve:**
   - `src/lib/beps-mli/api.ts` carica i JSON statici e li espone alla UI.
   - In futuro: backend HTTP che serve gli stessi dati con caching.

### HA e manutenibilità

- **Versioning per snapshot:** ogni dataset è legato a una data "Status as of" (es. 2023-06-30). Questo evita confusioni quando le posizioni MLI cambiano.
- **Idempotenza ETL:** lo script ETL può essere rieseguito per generare snapshot aggiornati senza rompere la UI.
- **Rollback:** se un aggiornamento dataset crea problemi, si può tornare al JSON della snapshot precedente.

## Test Plan (Golden Tests)

### Golden test 1 — Italia–Francia

**Input:**
- Paese A: ITA
- Paese B: FRA
- Status as of: 2023-06-30

**Expected:**
- MatchingOutcome esiste per `ITA-FRA`.
- Provisions includono:
  - Article 6 — outcome APPLIES, minimumStandard = true.
  - Article 7 — outcome APPLIES, minimumStandard = true.
- Spiegazioni in italiano coerenti con manuale MLI (purpose e PPT).

### Golden test 2 — Italia–Spagna

**Input:**
- Paese A: ITA
- Paese B: ESP
- Status as of: 2023-06-30

**Expected:**
- MatchingOutcome esiste per `ITA-ESP`.
- Provisions includono:
  - Article 6 — outcome APPLIES.
  - Article 7 — outcome APPLIES.
- Titolo trattato: "Convention between Italy and Spain for the Avoidance of Double Taxation...".

### Golden test 3 — Paese senza outcome demo

**Input:**
- Paese A: DEU
- Paese B: ESP
- Status as of: 2023-06-30

**Expected:**
- Nessun MatchingOutcome nel dataset demo.
- UI mostra messaggio chiaro: "Il dataset interno contiene solo demo per alcune coppie (Italia–Francia, Italia–Spagna).".

### Test UI

- Ricerca standard:
  - Paese A bloccato su Italia, Paese B = Francia → navigazione corretta verso risultato demo ITA–FRA.
  - Paese B = Spagna → navigazione corretta verso risultato demo ITA–ESP.
- Modalità avanzata:
  - Paese A selezionabile, swap funzionante.
  - Coppia senza outcome (es. DEU–ESP) produce messaggio fallback.

## Roadmap

### Phase 1 — Discovery e design (completata)
- Analisi struttura dati OECD
- Definizione tipi TypeScript
- Progettazione UI/UX
- Documentazione

### Phase 2 — Backend e dati (in corso)
- Implementazione API layer demo (Italia–Francia, Italia–Spagna)
- Estensione dataset demo (Germania, Spagna)
- Documentazione ETL pipeline

### Phase 3 — Frontend UI (prossimo)
- Componenti CountrySelector, MatchingTable, StatisticsDashboard
- Pagine ricerca avanzata, risultato completo, dettaglio paese

### Phase 4 — Rifiniture (futuro)
- Spiegazioni in italiano per tutti gli articoli
- Tooltip e help contestuale
- Export e salvataggio
- Test e ottimizzazione

## Riferimenti

- OECD BEPS MLI Matching Database: https://www.oecd.org/en/data/tools/beps-mli-matching-database.html
- OECD BEPS MLI Overview: https://www.oecd.org/en/topics/beps-multilateral-instrument.html
- OECD MLI Toolkit: https://www.oecd.org/en/topics/sub-issues/beps-multilateral-instrument/beps-mli-toolkit.html
- MLI Positions Italia: beps-mli-position-italy.pdf
- MLI Positions Germania: beps-mli-position-germany.pdf
