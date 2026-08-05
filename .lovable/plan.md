# Tool "Amount B" (Pillar One) — architettura UX e motore di calcolo

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
```text
/tool/amount-b                      indice: cos'è, avvia nuovo calcolo, storico
/tool/amount-b/nuovo                procedura guidata (stato nel search param "step")
/tool/amount-b/risultato/$id        cruscotto esito
/tool/amount-b/storico              elenco calcoli salvati
```
Voce "Amount B" aggiunta al menu Tool (header desktop, drawer mobile) e alle card di /tool e Home.

## Procedura guidata — 7 passi
1. Identificazione entità: denominazione, paese, esercizio, valuta.
2. Ambito di applicazione: attività di distribuzione, rivendita, agente/commissionario; esclusioni
   (beni non materiali, servizi, commodity, attività non di routine).
3. Dati economici: ricavi netti, costo del venduto, spese operative, utile operativo.
4. Attivo e capitale: attivo operativo netto, crediti, rimanenze, debiti commerciali.
5. Classificazione: gruppo industriale (1/2/3), area geografica, categoria di mercato,
   disponibilità del rating creditizio.
6. Verifiche di soglia: intensità di spese operative, intensità di attivo, verifica dei costi.
7. Riepilogo e conferma: elenco completo dei dati con possibilità di tornare a ogni passo.

Ogni passo: indicatore di avanzamento (passo N di 7 + barra), validazione bloccante con messaggi
in italiano, tooltip contestuale su ogni campo tecnico, salvataggio automatico della bozza.

## Esito (cruscotto)
- Quattro schede KPI: rendimento sulle vendite ottenuto, intervallo di riferimento, scostamento,
  rettifica indicativa.
- Semaforo di conformità: verde (dentro l'intervallo), ambra (entro la tolleranza operativa),
  rosso (fuori intervallo) — con motivazione testuale.
- Grafici: posizione del rendimento rispetto all'intervallo; confronto tra indicatori di intensità
  e le rispettive soglie (componenti `chart.tsx` già presenti).
- Pannello "Come si arriva a questo risultato": passaggi in linguaggio ordinario, con i parametri
  applicati e la versione della matrice usata.
- Esportazione PDF (stampa formattata) ed Excel (foglio dati generato lato server).

## Storico
Elenco dei calcoli con data, entità, esercizio, esito e apertura del cruscotto. Bozza in corso
evidenziata e ripristinabile.

## Dettagli tecnici
**Motore separato dalla UI.** Nessun componente contiene formule.
- `src/lib/amount-b/parameters.v2024.ts` — dati tabellari: matrice di prezzo per gruppo
  industriale/intensità, soglie di intensità, correttivi geografici e di rating creditizio,
  intervallo (±0,5 pp), tolleranza. Un solo export con un campo `version`.
- `src/lib/amount-b/types.ts` — `AmountBInput`, `AmountBOutcome`, `ComplianceStatus`,
  `EngineTrace` (passaggi spiegabili).
- `src/lib/amount-b/engine.ts` — funzione pura `computeAmountB(input, parameters)`: determina
  ambito, classifica, calcola gli indicatori, individua la cella della matrice, produce esito e
  tracciato. Nessuna dipendenza da React.
- `src/lib/amount-b/validation.ts` — schemi zod per passo, riusati dalla UI e dal server.
- `src/lib/amount-b.functions.ts` — `saveAmountBDraft`, `runAmountBCalculation`,
  `listAmountBCalculations`, `getAmountBCalculation`, `exportAmountBWorkbook`.
- `src/lib/repositories/amount-b.repository.server.ts` — persistenza mock in memoria con
  correlation ID, audit, timeout e degrado controllato, coerente con gli altri repository.

**Componenti riusabili** in `src/components/amount-b/`: `WizardShell` (avanzamento + navigazione),
`WizardField` (etichetta, tooltip, errore), `KpiCard`, `ComplianceLight`, `RangeChart`,
`IntensityChart`, `ExplanationPanel`, `CalculationHistoryTable`.

**Bozza.** Salvataggio automatico differito su `localStorage` per la ripresa immediata e, in
parallelo, sul repository lato server; il passo corrente vive nel search param, così il collegamento
è condivisibile.

**Sostituibilità delle formule.** `computeAmountB` riceve i parametri come argomento; affiancare una
versione successiva significa aggiungere `parameters.vXXXX.ts` e selezionarla per esercizio.

Dati dimostrativi marcati come demo, coerentemente con il resto del portale.
