# Ravvedimento — Penalty Rules Manifest

## Scopo

Definire il ruleset sanzionatorio per il ravvedimento spontaneo, con versioning e validazione.

## Struttura ruleset

```ts
type PenaltyRegime = {
  id: string;
  legalVersion: string; // es. "2024-01-01"
  violationType: ViolationType;
  taxType: TaxType;
  baseRate: DecimalString; // aliquota sanzionatoria base
  reductionCoefficients: ReductionCoefficient[];
  sources: LegalSource[];
  status: 'verified' | 'disabled';
};

type ReductionCoefficient = {
  id: string;
  description: string; // es. "1/10 se entro 30 giorni"
  coefficient: DecimalString; // es. "0.1"
  appliesWhen: Predicate; // funzione che valuta il contesto
  sources: LegalSource[];
};
```

## Regole attuali (da verificare)

Il prompt menziona frazioni di riduzione:
- 1/10
- 1/9
- 1/8
- 1/7
- 1/6
- 1/5

**Prima di congelare queste casistiche è necessario verificare:**
- Violazioni giornaliere
- Ravvedimento entro 15 giorni
- Differenza tra aliquota sanzionatoria base e frazione di riduzione
- Regime applicabile in base alla data della violazione
- Effetti delle modifiche normative recenti
- Cause ostative

## Formula

```
penalty base rate
×
reduction coefficient
=
reduced penalty rate
```

## Versioning

- Ogni ruleset ha una `legalVersion` (data di entrata in vigore).
- Il motore seleziona il ruleset in base alla data della violazione.
- Se nessun ruleset è disponibile per la data, il calcolo va bloccato.

## TODO

- [ ] Verificare regole sanzionatorie per ogni tipo di violazione.
- [ ] Documentare fonti normative (D.Lgs. 471/1997, D.Lgs. 472/1997, modifiche recenti).
- [ ] Definire coefficienti di riduzione per ogni fascia temporale.
- [ ] Validare regole con professionista fiscale.
