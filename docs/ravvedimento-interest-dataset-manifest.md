# Ravvedimento — Interest Dataset Manifest

## Scopo

Documentare il dataset dei tassi di interesse legale usato per il calcolo del ravvedimento.

## Dataset attuale

**Fonte:** `Interessi_aggi_file generale.xls` (allegato) [file:69]

**Copertura:**
- Saggio legale dal 1942 al 31 dicembre 2025.
- **Non contiene il tasso applicabile dal 1° gennaio 2026.**

### Tassi legali disponibili

| Anno | Tasso |
|------|-------|
| 2020 | 0,05% |
| 2021 | 0,01% |
| 2022 | 1,25% |
| 2023 | 5,00% |
| 2024 | 2,50% |
| 2025 | 2,00% |

### Altre famiglie di tassi presenti nel file

- Interessi di mora
- Ritardata iscrizione a ruolo
- Interessi ex art. 44
- Sospensione ex art. 39
- Aggi e oneri di riscossione
- Tasso ufficiale di riferimento
- Aliquote IRES storiche

**Nota:** queste serie non devono essere unite in un unico archivio generico. Ogni famiglia deve avere il proprio dataset versionato.

## Struttura dataset

```
src/lib/ravvedimento/
  datasets/
    legal-interest-rates/
      1942-2025.ts
      manifest.ts
    penalty-regimes/
      registry.ts
    adjustment-rules/
      registry.ts
```

## Versioning

- `LEGAL_INTEREST_DATASET_VERSION`: versione del dataset dei tassi legali.
- `PENALTY_RULESET_VERSION`: versione del ruleset sanzionatorio.
- `RAVVEDIMENTO_MODEL_VERSION`: versione del modello di calcolo complessivo.

## Copertura dataset

- **Covered through:** 31 dicembre 2025.
- Se `paymentDate > dataset.coveredThrough`, il calcolo va **bloccato**, non solo accompagnato da un warning.

## TODO

- [ ] Verificare tasso 2026 da fonte ufficiale (MEF/Gazzetta Ufficiale).
- [ ] Estendere dataset al 2026 quando disponibile.
- [ ] Documentare convenzione giornaliera (365 vs 366 per anni bisestili).
- [ ] Documentare arrotondamento per segmento e totale.
