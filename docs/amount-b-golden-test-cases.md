# Amount B Golden Test Cases

## Scopo

Definire i golden test per validare l'implementazione TypeScript contro il workbook OECD.

## 1. Japan Sample (quantitative scoping + Section 5.1 base)

**Fonte:** `2 Inputs for pricing` + `3 Automated Calculations` [file:69]

### Input

- **Giurisdizione:** Japan
- **Industry Grouping:** 1
- **Factor Intensity Classification:** C
- **Net revenues (year x-3, x-2, x-1):** 199, 195, 205
- **Operating expenses:** 50, 47, 46
- **COGS:** 145, 142, 154
- **Creditors:** 33, 34, 36
- **Stock, Debtors, Fixed assets:** come da workbook

### Output attesi

- **OES:** ~0,2387 (23,87%)
- **Quantitative scoping criteria:** met
- **Factor Intensity:** C
- **Section 5.1 RoS:** 2,50%
- **Range:** 2,00% – 3,00%
- **Accounts payable days:** ~83,07 / 87,39 / 85,32
- **exceedsAccountsPayableGuardrail:** false (tutti < 90)
- **Section 5.2 adjustment:** none
- **Section 5.3 adjustment:** none
- **Final RoS:** 2,50%

### Ramo coperto

- Scoping quantitativo positivo
- Factor intensity C
- Pricing matrix base
- Nessun trigger OECC
- Nessun adjustment DAM

### Ramo NON coperto

- Cap/collar OECC triggerati
- DAM adjustment
- Multi-industry con de minimis
- Giurisdizioni con rating diverso e NRA

---

## 2. Test OECC Cap Trigger (da definire)

**Obiettivo:** validare Section 5.2 con cap triggerato.

**Input:**
- Da costruire con:
  - equivalent return on OPEX > cap (0.6 o alternativo)

**Output atteso:**
- `capTriggered = true`
- Adjustment Section 5.2 applicato

---

## 3. Test DAM Adjustment (da definire)

**Obiettivo:** validare Section 5.3 con adjustment attivo.

**Input:**
- Giurisdizione DAM-qualifying
- OAS > 0
- Sovereign credit rating → NRA non-zero

**Output atteso:**
- `adjustment = OAS_capped * netRiskAdjustment`
- `finalRoS` diverso da Section 5.1

---

## 4. Test Multi-Industry con De Minimis

**Obiettivo:** validare logica multi-industry e soglia 20%.

**Input:**
- Prodotti in due o tre industry grouping
- Net revenues split:
  - Majority in una industry
  - Altre < 20% o > 20%

**Output atteso:**
- Se de minimis rispettato → RoS determinato dalla industry principale
- Se de minimis superato → weighted average RoS

---

## 5. Test Scoping Non Met

**Obiettivo:** validare ramo in cui OES fuori bounds.

**Input:**
- OES < 3% o OES > upper bound

**Output atteso:**
- `Quantitative scoping criteria not met`
- Nessuna continuazione con pricing (o output bloccato)

---

## 6. Test Accounts Payable Guardrail Trigger

**Obiettivo:** validare ramo con creditors adjustment.

**Input:**
- Accounts payable days > 90 per almeno un anno

**Output atteso:**
- `exceedsAccountsPayableGuardrail = true`
- Adjusted creditors usati per working capital

---

## Nota

Questi test dovranno essere tradotti in file `.test.ts` una volta che il contratto TypeScript e l'engine saranno definiti (Phase 2 e 3).
