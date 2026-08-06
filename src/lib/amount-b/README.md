# Amount B – Simplified and Streamlined Approach

Implementazione del workbook OCSE "Pricing Automation Tool for the Simplified and
Streamlined Approach", versione February 2026.

## Struttura

| File                                    | Contenuto                                                  |
| --------------------------------------- | ---------------------------------------------------------- |
| `model.ts`                              | Contratto di input e output del calcolo                     |
| `engine.ts`                             | Funzioni pure, con i riferimenti alle celle del workbook     |
| `engine.test.ts`                        | Golden test contro i valori del workbook                     |
| `parse.ts`                              | Lettura dei numeri digitati dall'utente                      |
| `datasets/registry.ts`                  | Registro delle versioni delle data table                     |
| `datasets/<versione>/jurisdictions.ts`  | Giurisdizioni estratte da una data table                     |
| `datasets/reference-tables.ts`          | Scala rating-NRA, fasce OECC, prodotti                       |
| `datasets/pricing-matrix.ts`            | Matrice Section 5.1, cap e collar, soglie                    |
| `datasets/checksums.ts`                 | Checksum dei dataset, registrati in ogni run                 |

Il motore non dipende da React, dalla rete o dal filesystem: riceve un `AmountBInput`
e restituisce un `AmountBResult`. La UI vive in `src/components/tools/amount-b/` e
nelle rotte `src/routes/tool.amount-b.*`.

## Versioning

Le giurisdizioni sono versionate per data table, la matrice di pricing per versione
del workbook. La distinzione non è formale: tra la data table di dicembre 2024 e
quella di gennaio 2026 sono cambiati i rating sovrani di trenta giurisdizioni, con
effetto diretto sulla rettifica della Section 5.3. Ogni run registra le versioni
usate e i checksum dei dataset.

## Test

Il progetto non porta un runner di test tra le dipendenze. Per eseguire i golden test:

```
bun add -d vitest
bunx vitest run src/lib/amount-b/engine.test.ts
```

I file `*.test.ts` sono esclusi da `tsconfig.json`, così `tsc --noEmit` resta pulito
anche quando il runner non è installato.

Copertura attuale: 26 test. Il caso base riproduce il campione Japan precaricato nel
workbook, compresi i valori intermedi (giorni di debito 83,07 / 87,39 / 85,32,
capitale circolante 22 / 6 / 15, attività operative nette 72 / 48 / 55). Gli altri
casi coprono cap e collar della Section 5.2, la rettifica e il cap dell'85% della
Section 5.3, la de minimis multi-industry nelle due direzioni, il guardrail sui
debiti commerciali compreso il valore esattamente a 90 giorni, lo scoping non
soddisfatto e la giurisdizione assente dalla data table.

## Scostamento voluto rispetto al workbook

Nelle celle E85 ed E109 del foglio "3 Automated Calculations" il workbook cerca la
classificazione OAS e la scala rating-NRA nel foglio "Data Table as of December
2024", con un riferimento fisso, anche quando i dati di giurisdizione vengono letti
dalla data table di gennaio 2026. Oggi la cosa non produce differenze di calcolo
perché quei due intervalli coincidono nelle tre data table, verificato in fase di
estrazione. Questa implementazione non replica il riferimento fisso e lega entrambe
le tabelle alla versione selezionata: se una futura data table modificasse la scala,
il workbook continuerebbe a usare quella vecchia in silenzio, qui no.

## Riferimenti

- OCSE, "Pricing Automation Tool for the Simplified and Streamlined Approach",
  February 2026, file `pillar-one-amount-b-pricing-automation-tool-february-2026.xlsx`
- `docs/amount-b-calculation-manifest.md`, `docs/amount-b-unresolved-rules.md`
