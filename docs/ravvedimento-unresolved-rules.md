# Ravvedimento — Unresolved Rules

## Scopo

Registrare tutte le regole, comportamenti e dettagli che non sono completamente specificati o che richiedono interpretazione.

## 1. Tasso legale 2026

**Problema:** il dataset termina al 31/12/2025. Manca il tasso ufficiale 2026.

**Azione:** verificare da fonte ufficiale (MEF/Gazzetta Ufficiale) e estendere dataset.

## 2. Convenzione giornaliera

**Problema:** contraddizione tra "esclusione primo giorno" e 582 giorni inclusivi.

**Azione:** documentare convenzione corretta con professionista fiscale.

## 3. Arrotondamento

**Problema:** non documentato per segmento e totale.

**Azione:** definire politica di arrotondamento e implementare decimal-safe arithmetic.

## 4. Maggiorazione integrativa 0,5%

**Problema:** non può essere una regola globale.

**Azione:**
- Non creare `engine/maggiorazione.ts` come formula universale.
- Creare `rules/adjustments/registry.ts` con regola disattivata fino a validazione.
- Se la fonte non è verificata, l'engine deve restituire: "Maggiorazione non calcolata: regola non configurata per il caso selezionato."

## 5. Acquiescenza e adesione

**Problema:** non sono semplici "tipi di ravvedimento".

**Azione:**
- Escludere dal primo rilascio.
- L'interfaccia deve chiedere la **violazione**, non il generico "tipo ravvedimento".

## 6. Frazioni di riduzione

**Problema:** non devono essere una lista statica di sei valori.

**Azione:**
- Il motore deve ricevere `ViolationContext` completo.
- La riduzione deve essere selezionata da una ruleset versionata, non da `daysLate < 30 ? 1/10 : ...`.

## 7. Dataset storici

**Problema:** il file allegato contiene molte famiglie di tassi, non solo il saggio legale.

**Azione:**
- Separare dataset per famiglia:
  - `legal-interest-rates/`
  - `penalty-regimes/`
  - `adjustment-rules/`
- Rinominare `OECD_VERSION` in `RAVVEDIMENTO_MODEL_VERSION`, `LEGAL_INTEREST_DATASET_VERSION`, `PENALTY_RULESET_VERSION`.

## 8. Accesso pubblico

**Problema:** limitazioni per accesso pubblico.

**Azione:**
- Nessuna conservazione server-side per impostazione predefinita.
- Nessun audit trail dichiarato se il risultato vive solo in memoria o localStorage.
- PDF locale possibile, se verificato.
- Nessun dato fiscale nei log.
- Telemetry solo tecnica e aggregata.
- Cancellazione del draft chiaramente disponibile.

## 9. Quality gate

**Problema:** prima del merge, verificare:

- [ ] Tasso 2026 verificato e copertura dataset estesa
- [ ] Caso €45.120 riconciliato periodo per periodo
- [ ] Convenzione giorni documentata
- [ ] Regola bisestile documentata
- [ ] Arrotondamento definito per segmento e totale
- [ ] Regimi sanzionatori versionati per data violazione
- [ ] Nessuna applicazione automatica della maggiorazione 0,5% senza regola verificata
- [ ] Acquiescenza, adesione, mora e ruolo esclusi dal primo rilascio
- [ ] Decimal arithmetic
- [ ] Test delle date ai confini
- [ ] Test di copertura vuota del dataset
- [ ] Calculation trace con fonte per ogni segmento
- [ ] Disclaimer persistente nei risultati e negli export
- [ ] Feature flag e rollback testati
- [ ] Nessun dato economico nei log
- [ ] Test WCAG 2.2 AA e navigazione tastiera

## 10. Prompt corretto per Lovable

**Decisione:** B-A-B.

Build a public first release for spontaneous regularisation of omitted, insufficient or late tax payments.

The intended scope includes:
- legal interest;
- reduced penalties;
- only those additional adjustments whose applicability, calculation base, rate, effective dates and legal sources have been explicitly verified.

Do not include acquiescence, tax settlement, judicial conciliation, collection rolls, late-enrolment interest, collection interest, suspension interest or instalment plans in the first release.

Do not code yet.

First produce:
1. docs/ravvedimento-supported-cases.md
2. docs/ravvedimento-interest-dataset-manifest.md
3. docs/ravvedimento-penalty-rules-manifest.md
4. docs/ravvedimento-rounding-and-day-count.md
5. docs/ravvedimento-test-vectors.md
6. docs/ravvedimento-unresolved-rules.md

Important:
- The supplied spreadsheet covers the legal interest rate through 31 December 2025 only.
- Do not assume the 2025 legal rate continues in 2026.
- Do not use EUR 45,120 as a golden expected result until it is reconciled period by period.
- Resolve the contradiction between 582 inclusive days and the stated exclusion of the first day.
- Do not implement a generic 0.5% supplementary charge.
- Version interest datasets and penalty rules separately.
- Use decimal-safe arithmetic.
- Stop after discovery and present all unresolved legal and arithmetic cases.
