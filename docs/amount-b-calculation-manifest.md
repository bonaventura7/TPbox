# Amount B Calculation Manifest

## Scopo

Descrivere, per ogni regola di calcolo rilevante nel workbook, la semantica esatta, le dipendenze e il comportamento atteso in TypeScript.

> **Rettifiche del 6 agosto 2026.** L'estrazione del workbook ha corretto due punti di
> questo documento, redatto in fase di discovery. Primo: le voci patrimoniali entrano
> nel calcolo come media tra saldo di apertura e saldo di chiusura, non come saldo
> puntuale, e servono quindi quattro esercizi di stato patrimoniale (§3 e §2 qui
> sotto). Secondo: il cap della Section 5.2 non è un valore unico dello 0,6 ma dipende
> dalla fascia di factor intensity e dalla categoria della giurisdizione (§6).
> L'implementazione di riferimento è `src/lib/amount-b/engine.ts`; le regole verificate
> sono elencate in `amount-b-unresolved-rules.md`.

## Convenzioni

- `Sheet`: nome del worksheet nel workbook
- `Cell`: riferimento cella o intervallo
- `Formula`: formula Excel (o descrizione equivalente)
- `Rounding`: comportamento di arrotondamento
- `Blank/Error`: gestione di blank, zero, errori
- `TS Pseudocode`: pseudocodice TypeScript proposto

---

## 1. Operating Expense Intensity (OES) – Scoping

**Sheet:** `3 Automated Calculations`  
**Range:** sezione "1. Calculation for quantitative scoping criteria"  
**Dipendenze:** `1 Inputs for scoping` (net revenues, operating expenses)

### a) OES weighted average

- **Formula Excel:**
  - `OES = weighted average(operating expenses / net revenues)` su anni x-3, x-2, x-1
- **Rounding:** come da workbook (tipicamente floating point; verificare se ci sono arrotondamenti espliciti)
- **Blank/Error:**
  - Se net revenues o OpEx mancanti per un anno: escludere l'anno o trattare come errore (da chiarire)
- **TS Pseudocode:**

```ts
function computeOES(years: YearData[]): Decimal {
  // years: { netRevenues, operatingExpenses }
  const totalNetRevenues = sum(years.map(y => y.netRevenues));
  const totalOpEx = sum(years.map(y => y.operatingExpenses));
  return totalOpEx / totalNetRevenues;
}
```

### b) Quantitative scoping criteria

- **Sheet:** `3 Automated Calculations`
- **Formula:**
  - `met = lowerBound <= OES <= upperBound`
- **Lower/Upper bound:**
  - Lower: 3%
  - Upper: tra 20% e 30% (da workbook/jurisdiction)
- **Output:**
  - `Quantitative scoping criteria met` / `not met`
- **Nota:** il workbook specifica che gli elementi qualitativi (par. 13.a e 14) non sono automatizzati.

---

## 2. Accounts Payable Guardrail

**Sheet:** `3 Automated Calculations` – sezione "2.1. Calculation for pricing under Section 5.1"

### a) Accounts payable days

- **Formula:**
  - `mediaCreditors / COGS × 365`, dove `mediaCreditors` è la media tra saldo di
    apertura e saldo di chiusura dell'esercizio (riga 21), non il saldo puntuale
- **Esempio (Japan sample):** ~83,07 / 87,39 / 85,32 giorni
- **Soglia:** 90 giorni. Esattamente 90 giorni rispettano la soglia: la cella D25 usa
  `IFS(giorni > 90, "NO", giorni <= 90, "YES")`
- **Guardrail:**
  - `exceedsAccountsPayableGuardrail = accountsPayableDays > 90`
- **Effetto:**
  - Se `exceedsAccountsPayableGuardrail = false` → no adjustment creditors
  - Se `true` → adjustment creditors per working capital

**TS Pseudocode:**

```ts
function accountsPayableDays(creditors: Decimal, cogs: Decimal): Decimal {
  return (creditors / cogs) * 365;
}

function exceedsAccountsPayableGuardrail(days: Decimal): boolean {
  return days > 90;
}
```

---

## 3. Working Capital e Net Operating Assets (NOA)

**Sheet:** `3 Automated Calculations`

### a) Media dei saldi patrimoniali

Tutte le voci patrimoniali (stock, debtors, creditors, fixed assets) sono prima
mediate tra apertura e chiusura, sui quattro esercizi da x-4 a x-1 forniti in input:

- `media(x-3) = IF(x-4 = 0, x-3, (x-4 + x-3) / 2)`
- `media(x-2) = IF(AND(x-4 = 0, x-3 = 0), x-2, (x-3 + x-2) / 2)`
- `media(x-1) = IF(AND(x-4 = 0, x-3 = 0, x-2 = 0), x-1, (x-2 + x-1) / 2)`

Il saldo puntuale sostituisce la media solo quando tutti gli esercizi precedenti sono
a zero, caso delle società con storico più breve.

### b) Working Capital

- **Formula:**
  - `Working Capital = mediaStock + mediaDebtors - creditorsUsed`, dove `creditorsUsed`
    è la media dei debiti se il guardrail non è attivato, i debiti rettificati se lo è

### c) Net Operating Assets

- **Formula:**
  - `NOA = mediaFixedAssets + Working Capital`

### d) OAS (Net Operating Assets to Sales)

- **Formula:**
  - `OAS = weighted average(NOAs) / weighted average(net revenues)`

---

## 4. Factor Intensity Classification

**Sheet:** `3 Automated Calculations` – tabella "Factor Intensity classification"

- **Input:** OAS, OES
- **Classificazione:**
  - A: OAS ≥ 45%
  - B: 30% ≤ OAS < 45%
  - C: 15% ≤ OAS < 30%
  - D: OAS < 15% e OES ≥ 10%
  - E: OAS < 15% e OES < 10%

**TS Pseudocode:**

```ts
type FactorIntensity = 'A' | 'B' | 'C' | 'D' | 'E';

function classifyFactorIntensity(oas: Decimal, oes: Decimal): FactorIntensity {
  if (oas >= 0.45) return 'A';
  if (oas >= 0.30) return 'B';
  if (oas >= 0.15) return 'C';
  if (oes >= 0.10) return 'D';
  return 'E';
}
```

---

## 5. Section 5.1 – Pricing Matrix

**Sheet:** `3 Automated Calculations` – tabella "Pricing matrix under Section 5.1"

- **Matrice:** 5 × 3 (Factor Intensity × Industry Group)
- **Output:**
  - `targetRoS` dalla matrice
  - `range = [targetRoS - 0.5%, targetRoS + 0.5%]`

**Tipo TypeScript:**

```ts
type PercentageRange = {
  target: string; //DecimalString
  lower: string;
  upper: string;
};
```

**Esempio (Japan sample):**

- `target = 2,50%`
- `range = [2,00%, 3,00%]`

---

## 6. Section 5.2 – Operating Expense Cross-Check (OECC)

**Sheet:** `3 Automated Calculations` – sezione "2.2. Calculation for pricing under Section 5.2"

- **Cap & Collar** (foglio "3 Automated Calculations", I82:N87). Il cap dipende dalla
  fascia di factor intensity e dal regime della giurisdizione, che deriva dalla
  categoria: Category 1 usa i cap standard, Category 2 quelli alternativi.

  | Fascia | Factor intensity | Cap standard | Cap alternativo |
  | --- | --- | --- | --- |
  | High OAS | A | 70% | 80% |
  | Medium OAS | B, C | 60% | 70% |
  | Low OES | D, E | 40% | 45% |

  - Collar: 10%, unico per tutte le fasce
- **Equivalent return on OPEX:**
  - `EBIT / OpEx`
- **Trigger:**
  - `capTriggered = equivalentReturnOnOpEx > cap`
  - `collarTriggered = equivalentReturnOnOpEx < collar`
- **Adjustment:**
  - Se nessun trigger → no adjustment

---

## 7. Section 5.3 – Data Availability Mechanism (DAM)

**Sheet:** `3 Automated Calculations` – sezione "2.3. Calculation for pricing under Section 5.3"

- **OAS cap:** 85%
- **Sovereign credit rating → NRA:**
  - Da `Data Table` (Moodys/SP/Fitch → credit rating usato)
- **Net risk adjustment:**
  - Basato su rating e NRA
- **Adjustment:**
  - `adjustment = OAS_capped * netRiskAdjustment`

---

## 8. Final Return on Sales

**Sheet:** `3 Automated Calculations` – sezione "3. The final return on sales under Section 5"

- **Input:**
  - RoS da Section 5.1 o 5.2
  - Adjustment da Section 5.3
- **Output:**
  - `finalRoS = adjustedRoS`

---

## Note trasversali

- Ogni run deve registrare:
  - `workbookVersion`
  - `jurisdictionDatasetVersion`
  - `pricingMatrixVersion`
  - `datasetChecksums`
- Separare sempre:
  - esito scoping quantitativo
  - valutazione qualitativa (non automatizzata)
  - output meccanici di pricing
