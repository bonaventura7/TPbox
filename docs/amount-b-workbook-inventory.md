# Amount B Workbook Inventory

## Fonte

OECD, "Pricing Automation Tool for The Simplified and Streamlined Approach", February 2026 version. [file:69]

## Worksheet logici

1. **READ ME**
   - Descrizione generale del tool, disclaimer, ownership OECD, termini d'uso.
   - Indicazione che il tool automatizza i calcoli del return on sales per le qualifying transactions under Annex III of Chapter IV delle OECD Transfer Pricing Guidelines.
   - Nota esplicita: il tool non verifica automaticamente gli elementi qualitativi dei paragrafi 13.a e 14.

2. **1 Inputs for scoping**
   - Input: net revenues, operating expenses per year x-3, x-2, x-1.
   - Output: OES weighted average, upper/lower bound, esito "Quantitative scoping criteria met/not met".
   - Nota: il tool non può verificare automaticamente gli elementi qualitativi (par. 13.a e 14).

3. **2 Inputs for pricing**
   - Input: giurisdizione, PL extract (net revenues, COGS, OpEx), balance sheet extract (assets, debtors, stock, creditors), industry grouping.
   - Output: summary per pricing (Section 5.1, 5.2, 5.3), guardrail creditors, fattori per matrice.

4. **3 Automated Calculations**
   - Calcoli dettagliati per:
     - OES e scoping quantitativo
     - Accounts payable guardrail
     - Working capital, NOA, OAS
     - Factor Intensity Classification
     - Section 5.1 (pricing matrix, range ±0,5%)
     - Section 5.2 (OECC cap & collar)
     - Section 5.3 (DAM, sovereign rating → NRA, OAS cap 85%)
     - Final Return on Sales

5. **Data Table as of January 2026**
   - Classificazione giurisdizioni per OECC e DAM (cap rates, credit rating, DAM qualifying, NRA, OAS classification).
   - Versione più recente dei dataset.

6. **Data Table as of December 2024**
   - Versione precedente delle stesse tabelle (storico).

7. **Data Table as of March 2024**
   - Versione ancora precedente (storico).

## Implicazioni architetturali

- I tre data table non sono "documentazione": sono dataset versionati usati per classificazioni, rating, cap, NRA, OAS.
- Il motore deve essere **version-aware**: ogni run deve registrare:
  - `workbookVersion: "2026-02"`
  - `jurisdictionDatasetVersion: "2026-01"` (o altra)
  - `pricingMatrixVersion`
  - `datasetChecksums`

## Riferimenti

- File Excel: `pillar-one-amount-b-pricing-automation-tool-february-2026.xlsx` [file:69]
