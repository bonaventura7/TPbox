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

## Strategia di integrazione

### Opzione A (Raccomandata) - API Layer + UI Custom

Creare un layer di astrazione che:
- Fa fetch dei dati da OECD (backend o funzioni server)
- Li normalizza in un formato interno
- Li serve alla UI custom con branding del portale
- Permette di aggiungere valore (spiegazioni, filtri avanzati, export)

**Vantaggi:**
- Controllo totale su UI/UX
- Possibilità²° di caching e ottimizzazione
- Indipendenza da cambiamenti OECD (se il layer è ben progettato)
- Possibilità²° di arricchire i dati con spiegazioni in italiano

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
/tool/beps-mli                    indice: cos'è²°, avvia ricerca, statistiche
/tool/beps-mli/ricerca            interfaccia di ricerca con filtri
/tool/beps-mli/risultato          matching outcomes tra due paesi
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
  id: string; // es. "ITA"
  name: string; // es. "Italy"
  nameIt: string; // es. "Italia"
  signatureDate?: string;
  entryIntoForceDate?: string;
  coveredTaxAgreements: CoveredTaxAgreement[];
  reservations: Reservation[];
  choices: Choice[];
}

interface MatchingOutcome {
  jurisdiction1: string;
  jurisdiction2: string;
  mliProvisions: MliProvision[];
  lastUpdated: string;
}

interface MliProvision {
  article: string; // es. "Article 6"
  provisionType: string; // es. "Minimum Standard"
  outcome: string; // es. "Applies"
  explanation: string; // spiegazione in italiano
}
```

### UI/UX migliorata

**Rispetto a OECD:**

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

## Integrazione con OECD

### Approccio tecnico

1. **Backend proxy** (consigliato):
   - Funzione server che fa fetch da OECD
   - Normalizza i dati
   - Serve con caching (Redis o in-memory)
   - Gestisce errori e fallback

2. **Dataset statici** (alternativa):
   - Script per scaricare dati OECD periodicamente
   - Salvare in `public/data/beps-mli/`
   - Frontend fetch da file statici
   - Aggiornare con GitHub Actions o manualmente

3. **Iframe nascosto** (workaround rapido):
   - Pagina OECD in iframe nascosto
   - Overlay con UI custom
   - Comunicazione postMessage per estrarre dati
   - Limitato e fragile

### Compliance

- **Attribuzione:** "Fonte dati: OECD BEPS MLI Database" in piccolo
- **Disclaimer:** chiarire che i dati ufficiali sono su OECD
- **Termini d'uso:** rispettare licenza OECD
- **Link a OECD:** solo per approfondimenti, non come destinazione principale

## Roadmap

### Phase 1 — Discovery e design (1-2 giorni)
- Analizzare struttura dati OECD
- Definire tipi TypeScript
- Progettare UI/UX
- Creare documentazione

### Phase 2 — Backend e dati (2-3 giorni)
- Implementare API layer o dataset statici
- Normalizzare dati
- Testare fetching e caching

### Phase 3 — Frontend UI (3-4 giorni)
- Componenti CountrySelector, MatchingTable, ecc.
- Pagine ricerca, risultato, dettaglio
- Dashboard statistiche

### Phase 4 — Rifiniture (1-2 giorni)
- Spiegazioni in italiano
- Tooltip e help
- Export e salvataggio
- Test e ottimizzazione

## Riferimenti

- OECD BEPS MLI Matching Database: https://www.oecd.org/en/data/tools/beps-mli-matching-database.html
- OECD BEPS MLI Overview: https://www.oecd.org/en/topics/beps-multilateral-instrument.html
- OECD MLI Toolkit: https://www.oecd.org/en/topics/beps-multilateral-instrument.html#toolkit
