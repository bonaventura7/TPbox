# Amount B – Simplified and Streamlined Approach

## Panoramica

Questo modulo implementa la logica del workbook OECD "Pricing Automation Tool for the Simplified and Streamlined Approach" (February 2026 version) in modo:

- **Version-aware:** dataset separati per versione (2024-03, 2024-12, 2026-01, ecc.)
- **Testable:** golden test per ogni ramo decisionale
- **Manutenibile:** separazione tra dataset, engine e UI

## Struttura

```
src/lib/amount-b/
  README.md
  model.ts              # Tipi e contratti (PercentageRange, ecc.)
  engine/
    scoping.ts          # OES, quantitative scoping
    pricing51.ts        # Section 5.1 (pricing matrix, range)
    pricing52.ts        # Section 5.2 (OECC cap & collar)
    pricing53.ts        # Section 5.3 (DAM, NRA, OAS cap)
    guardrails.ts       # Accounts payable guardrail
  datasets/
    registry.ts         # Registro versioni
    checksums.ts        # Checksum dataset
    2024-03/
      jurisdictions.ts
      creditRatings.ts
      products.ts
    2024-12/
      jurisdictions.ts
      creditRatings.ts
      products.ts
    2026-01/
      jurisdictions.ts
      creditRatings.ts
      products.ts
```

## Principi

- Dataset versionati: ogni data table del workbook diventa un dataset versionato.
- Pricing matrix e lookup tab vivono nei dataset, non hardcoded nell'engine.
- Ogni calculation run registra:
  - `workbookVersion`
  - `jurisdictionDatasetVersion`
  - `pricingMatrixVersion`
  - `datasetChecksums`
- Separazione netta tra:
  - scoping quantitativo
  - valutazione qualitativa (non automatizzata)
  - Section 5.1, 5.2, 5.3
  - output finale

## Stato

- Phase 1 (discovery): documentazione e scheletro dataset
- Phase 2 (contratto TypeScript): da implementare
- Phase 3 (engine + test + UI): da implementare

## Riferimenti

- OECD, "Pricing Automation Tool for The Simplified and Streamlined Approach", February 2026
- File Excel: `pillar-one-amount-b-pricing-automation-tool-february-2026.xlsx`
- Documentation: `docs/amount-b-*.md`
