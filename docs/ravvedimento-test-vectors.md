# Ravvedimento — Test Vectors

## Scopo

Definire i test vectors per validare il motore di calcolo del ravvedimento.

## Test vector 1 — Caso utente (UNRECONCILED)

**Status:** `unreconciled` (non ancora golden test)

### Input

- Capitale: €376.592
- Periodo: 01/07/2020 – 05/08/2026
- Tassi legali: 2020 (0,05%), 2021 (0,01%), 2022 (1,25%), 2023 (5%), 2024 (2,5%), 2025 (2%)

### Output atteso (da riconciliare)

- Totale: €45.120

### Problemi aperti

1. **Tasso 2026 non disponibile**
   - Il dataset termina al 31/12/2025.
   - Manca il tasso ufficiale 2026.

2. **Convenzione giornaliera**
   - Contraddizione tra "esclusione primo giorno" e 582 giorni inclusivi.
   - 582 giorni includendo entrambe le date, 581 escludendo il giorno iniziale.

3. **Arrotondamento**
   - Non documentato.

4. **Variazione capitale**
   - Non documentata.

5. **Componenti incluse nei €45.120**
   - Non chiaro se include solo interessi o anche altre componenti.

### Calcolo parziale (fino al 31/12/2025)

| Periodo | Giorni | Tasso | Interesse |
|---------|--------|-------|-----------|
| 01/07/2020–31/12/2020 | 184 | 0,05% | €94,92 |
| 2021 | 365 | 0,01% | €37,66 |
| 2022 | 365 | 1,25% | €4.707,40 |
| 2023 | 365 | 5,00% | €18.829,60 |
| 2024 | 366 | 2,50% | €9.440,59 |
| 2025 | 365 | 2,00% | €7.531,84 |
| **Totale fino al 31/12/2025** | | | **€40.642,01** |

### Struttura TypeScript

```ts
type CandidateTestVector = {
  id: 'USER_CASE_001';
  status: 'unreconciled';
  expectedTotal: '45120.00';
  unresolved: [
    '2026 legal rate source',
    'day-count convention',
    'rounding convention',
    'capital changes',
    'components included in expected total'
  ];
};
```

### Validazione

Diventa golden test soltanto quando il dettaglio per periodo riconcilia il totale senza forzature.

## Test vector 2 — Caso semplice (da definire)

**Status:** `to_define`

### Input

- Capitale: €10.000
- Periodo: 01/01/2024 – 31/12/2024
- Tasso: 2,5%

### Output atteso

- Interesse: €250 (10.000 × 2,5% × 366/365)

### Note

- Anno bisestile (2024).
- Verificare divisore 365 vs 366.

## TODO

- [ ] Riconciliare test vector 1 con tasso 2026 e convenzione giornaliera.
- [ ] Definire test vector 2 con convenzione documentata.
- [ ] Aggiungere test vector per sanzioni ridotte.
- [ ] Aggiungere test vector per maggiorazione integrativa (solo se regola verificata).
