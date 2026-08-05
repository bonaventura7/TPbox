# Ravvedimento — Supported Cases (Discovery)

## Scopo

Definire il perimetro supportato dal tool di ravvedimento spontaneo, con distinzione tra casi supportati e non supportati.

## Perimetro supportato (primo rilascio)

**Ravvedimento spontaneo di un versamento omesso, insufficiente o tardivo.**

### Casi supportati

1. **Omesso versamento**
   - Violazione: mancato versamento di un tributo entro la scadenza.
   - Input: tributo, importo originario, data scadenza, data versamento.

2. **Insufficiente versamento**
   - Violazione: versamento parziale di un tributo.
   - Input: tributo, importo dovuto, importo versato, data scadenza, data versamento.

3. **Tardivo versamento**
   - Violazione: versamento effettuato oltre la scadenza.
   - Input: tributo, importo, data scadenza, data versamento.

### Casi NON supportati (primo rilascio)

- **Acquiescenza**
- **Accertamento con adesione**
- **Conciliazione giudiziale**
- **Cartelle e ruoli**
- **Interessi di mora**
- **Dilazioni**
- **Sospensioni**
- **Contenzioso**
- **Avvisi bonari** (salvo modulo futuro verificato)
- **Dichiarazione tardiva o integrativa** (solo se supportata da regole verificate)

## Struttura dati

```ts
type ViolationType =
  | 'OMITTED_PAYMENT'
  | 'INSUFFICIENT_PAYMENT'
  | 'LATE_PAYMENT'
  | 'LATE_OR_INTEGRATIVE_DECLARATION' // solo se supportata
  | 'UNSUPPORTED';

type ViolationContext = {
  violationType: ViolationType;
  violationDate: ISODate;
  originalDueDate: ISODate;
  regularizationDate: ISODate;
  taxType: TaxType;
  minimumPenaltyRate: DecimalString;
  noticeReceived: boolean;
  formalAssessmentStarted: boolean;
  legalRegimeVersion: string;
};
```

## Nota

Il tool deve chiedere la **violazione**, non il generico "tipo ravvedimento". L'interfaccia deve guidare l'utente a selezionare la fattispecie corretta.
