# BEPS MLI Demo Data — Italia

## Scopo

Fornire un dataset dimostrativo per il BEPS MLI Database interno, focalizzato su **Italia** e **Francia**, per permettere a Lovable e alla UI di funzionare subito con dati realistici.

## Jurisdictions demo

```json
[
  {
    "code": "ITA",
    "nameEn": "Italy",
    "nameIt": "Italia",
    "isSignatory": true,
    "isParty": true,
    "signatureDate": "2017-06-07",
    "entryIntoForceDate": "2018-09-01"
  },
  {
    "code": "FRA",
    "nameEn": "France",
    "nameIt": "Francia",
    "isSignatory": true,
    "isParty": true,
    "signatureDate": "2017-06-07",
    "entryIntoForceDate": "2019-01-01"
  }
]
```

## Covered Tax Agreement demo

```json
[
  {
    "id": "ITA-FRA",
    "jurisdiction1": "ITA",
    "jurisdiction2": "FRA",
    "title": "Convention between Italy and France for the avoidance of double taxation",
    "statusAsOf": "2023-06-30"
  }
]
```

## Matching Outcome demo

```json
[
  {
    "agreementId": "ITA-FRA",
    "jurisdiction1": "ITA",
    "jurisdiction2": "FRA",
    "statusAsOf": "2023-06-30",
    "provisions": [
      {
        "article": "Article 6",
        "provisionType": "Purpose of a Covered Tax Agreement",
        "minimumStandard": true,
        "outcome": "APPLIES",
        "explanationIt": "L'articolo 6 chiarisce che la convenzione mira a eliminare la doppia imposizione senza creare opportunità di non imposizione o imposizione ridotta tramite evasione o elusione fiscale."
      },
      {
        "article": "Article 7",
        "provisionType": "Prevent treaty abuse (Principal Purpose Test)",
        "minimumStandard": true,
        "outcome": "APPLIES",
        "explanationIt": "L'articolo 7 introduce un test di scopo principale (Principal Purpose Test) per evitare che vantaggi convenzionali siano concessi in presenza di schemi abusivi."
      }
    ]
  }
]
```

## Aggregate Stats demo

```json
{
  "statusAsOf": "2023-06-30",
  "totalJurisdictions": 2,
  "totalCoveredAgreements": 1,
  "matchedAgreements": 1,
  "oneWayAgreements": 0,
  "waitingAgreements": 0
}
```

## Uso previsto

- La UI può usare questi dati per:
  - Popolare dropdown dei paesi (Italia, Francia)
  - Mostrare il matching outcome per il trattato ITA–FRA
  - Mostrare un piccolo cruscotto di statistiche
- In futuro, questi dati saranno sostituiti da dataset più completi o da un backend.
