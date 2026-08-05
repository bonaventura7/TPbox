# Amount B Unresolved Rules & Ambiguities

## Scopo

Registrare tutte le regole, comportamenti e dettagli che non sono completamente specificati nel workbook o che richiedono interpretazione.

## 1. Scoping qualitativo (par. 13.a e 14)

- Il workbook dichiara esplicitamente che non automatizza gli elementi qualitativi.
- **Domanda:** come deve essere comunicato l'output all'utente?
  - Opzione raccomandata:
    - `Quantitative scoping criteria met`
    - `Quantitative scoping criteria not met`
    - `Qualitative assessment required`
  - Evitare un generico "Eligible" che potrebbe essere interpretato come conclusione normativa completa.

## 2. Gestione blank/zero/error nelle formule

- Per molte formule (OES, OAS, working capital, ecc.) non è esplicitato:
  - Cosa succede se un anno ha net revenues o COGS = 0?
  - Cosa succede se un campo è blank?
- **Da chiarire:**
  - Trattare zero come valore valido o come errore?
  - Escludere l'anno dal weighted average se alcuni dati sono mancanti?

## 3. Arrotondamento e precisione

- Il workbook mostra percentuali con 2 decimali (es. 2,50%), ma non specifica sempre:
  - Quando arrotondare
  - Con quale precisione interna operare
- **Decisione provvisoria:**
  - Usare `Decimal` o stringhe decimali per tutti i calcoli
  - Arrotondare solo in fase di visualizzazione

## 4. Accounts payable guardrail

- Il workbook mostra:
  - "Meet 90-day threshold: YES"
  - "Guardrail triggered: NO"
- **Semantica:**
  - `exceedsAccountsPayableGuardrail = accountsPayableDays > 90`
  - Se `false` → no adjustment
- **Da verificare:**
  - Comportamento con valori esattamente = 90
  - Eventuali eccezioni per giurisdizioni specifiche

## 5. De minimis multi-industry (20%)

- Il workbook menziona una soglia de minimis per multi-industry, ma non in tutte le formule è chiarissimo come si applica.
- **Regola attesa:**
  - Se una seconda/terza industry grouping < 20% dei net revenues, il return è determinato solo dalla industry grouping principale.
  - Se > 20%, si usa weighted average.

## 6. OAS cap 85%

- Il workbook specifica un cap OAS all'85%, ma non sempre è chiaro:
  - Se il cap si applica prima o dopo altri adjustment
  - Come interagisce con altri limiti

## 7. Sovereign credit rating → NRA

- I data table mostrano:
  - Rating da Moody's, S&P, Fitch
  - "Credit rating used"
  - "NRA"
- **Da chiarire:**
  - Mapping esatto rating → NRA
  - Come gestire rating diversi tra le agenzie per la stessa giurisdizione

## 8. Versioning dei dataset

- Non è esplicitato nel workbook come un'implementazione debba gestire:
  - Aggiornamenti futuri delle data table
  - Compatibilità··tra versioni diverse
- **Decisione architetturale:**
  - Ogni data table diventa un dataset versionato (2024-03, 2024-12, 2026-01, ecc.)
  - Ogni run registra la versione usata

## 9. Export e audit trail

- Il workbook non specifica:
  - Come esportare i risultati
  - Quali metadati registrare per audit
- **Decisione provvisoria:**
  - Salvare in ogni run:
    - input completi
    - versioni dataset
    - output intermedi (OES, OAS, factor intensity, ecc.)
    - output finale
