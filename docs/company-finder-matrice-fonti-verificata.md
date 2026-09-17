# Company Finder — matrice delle fonti, verificata dal vivo

**Data delle misure:** 2026-09-17
**Metodo:** ogni riga marcata ✅ o ❌ è stata verificata chiamando la fonte reale, non
dedotta dal codice né letta in un documento.

## Perché questo documento esiste

Il progetto aveva quattro fonti di verità sulla copertura per paese — `coverage.ts`,
`API-KEYS-CATALOG.md`, il manuale "Regola d'Oro", e un report di ricerca esterno — e
**tutte e quattro contengono errori**, ciascuna in punti diversi. Alcuni esempi misurati:

| Affermazione | Fonte | Realtà |
|---|---|---|
| Grecia: "solo anagrafica, bilanci non strutturati" | `API-KEYS-CATALOG.md` | **Falso.** PDF di bilancio scaricato via API |
| Croazia: "bilanci CSV gratuiti" | catalogo + manuale | **Falso.** Login + reCAPTCHA obbligatori |
| Lettonia: "nessuna API gratuita" | report esterno | **Falso.** CSV CC0 con cifre vere |
| Irlanda: "documenti solo a tariffa" | `coverage.ts` | **Parziale.** L'indice dei depositi è gratuito |

**Conclusione operativa: nessuna fonte documentale è affidabile da sola.** Prima di
promuovere un paese si misura. Questo file registra le misure, con la prova accanto.

---

## Il criterio

Un paese è **coperto** solo se un server — senza browser, senza sessione utente, senza
risolvere CAPTCHA, senza pagare — arriva a **cifre di bilancio o a un documento di
bilancio**. Metadati che provano l'esistenza di un deposito non bastano: sarebbero una
copertura a metà, che il progetto esclude per principio.

---

## Paesi verificati dal vivo

### ✅ Slovacchia (SK) — documento, a richiesta

Catena completa provata su `registeruz.sk`, azienda reale (VOLKSWAGEN SLOVAKIA):

```
/api/uctovne-jednotky?ico=35757442        → id entità
/api/uctovna-jednotka?id=388477           → 37 bilanci depositati
/api/uctovna-zavierka?id=6965375          → obdobieDo "2025-12", report 10265903
/api/uctovny-vykaz?id=10265903            → allegato 12723642, application/pdf
/domain/financialreport/attachment/12723642
    → HTTP 200 | 585.380 byte | %PDF-   ✅
```

Riprovato attraverso il deployment di preview TPBox: **byte identici**, serviti senza mai
esporre l'host della fonte al client.

- **Chiave:** nessuna. **Formato:** PDF. **Esercizi:** 37.
- **Trappola:** `obdobieDo` è `YYYY-MM` (es. `"2025-12"`), non `YYYY-MM-DD`. Costante su
  12 anni di depositi campionati.
- **Trappola:** l'endpoint allegati **non** è `/api/priloha` (404) ma
  `/domain/financialreport/attachment/{id}`.
- **Nota:** un bilancio può avere 1-3 report. Filtrare per anno a monte evita di
  scaricare fino a 3 documenti per esercizio non richiesto.

### ✅ Grecia (GR) — documento, a richiesta

Via **API GEMI OpenData**, non via scraping del portale. Chiave di produzione rilasciata
dal servizio GEMI l'11.09.2026.

```
/api/opendata/v1/metadata/assemblySubjects        → 114 temi, 12+ finanziari
/api/opendata/v1/companies/1797901000/documents   → 113 delibere, 17 FINANZIARIE
                                                     anni 2026, 2025, 2024, 2023, 2022
/api/opendata/v1/downloadFile?key=assemblyDecision&elementId=5373649
    → HTTP 200 | 94.080 byte | %PDF- | 3 pagine   ✅
```

- **Chiave:** `GEMI_OPENDATA_API_KEY`, gratuita, richiede approvazione manuale.
- **Rate limit: 8 richieste/minuto.** La catena costa 2 chiamate per azienda → ~4
  aziende/minuto. **Richiede rate limiting e cache lato server**, altrimenti 429 sotto carico.
- **Trappole dello Swagger** (tutte e tre necessarie per farlo funzionare):
  - `basePath` è `/api/opendata/v1`, non `/opendata`
  - l'header di auth è **`api_key`** con underscore, non `api-key`
  - lo spec sta su `/api-docs`, percorso annunciato dall'header `Swagger-API-Docs-URL`
- **Temi di delibera finanziari:** id 4 (*"con bilancio allegato"*), 7, 8, 17, 42, 48,
  78, 79, 95; più 11, 22, 72 per le liquidazioni.
- **Regola d'oro:** `assemblyDecisionUrl` espone `opendata-api.businessportal.gr` — va
  aggiunto ad `ALLOWED_DOCUMENT_HOSTS` e incapsulato. La chiave viaggia in header, non in
  URL: nessun rischio di trafilamento nella query string.
- **Stato: provata, NON implementata.** `greek-filing.ts` usa ancora lo scraping della SPA.

### ✅ Lettonia (LV) — cifre strutturate, solo bulk

`data.gov.lv`, organizzazione `ur` (Uzņēmumu reģistrs). CSV in licenza **CC0-1.0**,
aggiornati nelle ultime 24 ore, con **cifre vere** di stato patrimoniale, conto economico
e rendiconto finanziario, unibili per numero di registrazione nazionale, su più esercizi
(2015-2017+ osservati).

- **Qualitativamente superiore a SK e GR:** fornisce *dati*, non un PDF da leggere.
- **Vincolo architetturale: solo bulk, ~620 MB, nessuna API per azienda.** Non scaricabile
  per richiesta utente su Vercel. Richiede pipeline ETL con ingestione periodica in
  database (il progetto ha già Supabase) e refresh schedulato.
- **È una forma di integrazione diversa da un adapter.** Sottovalutarlo significa
  scoprirlo impraticabile a metà implementazione.

### ❌ Polonia (PL) — indice, non documento

`api-krs.ms.gov.pl`, Dział 3, verificato su AVIO POLSKA (KRS 0000002594): 26 depositi
nella forma `{"dataZlozenia":"26.04.2002","zaOkresOdDo":"ROK OBROTOWY 2001"}` — data e
anno, **nessun documento**. Il codice lo dichiara già correttamente:
`availability: "REGISTRY_ONLY"`, `restriction: "SESSION_BOUND"`, nessun `downloadUrl`.

Il PDF vive su una SPA protetta da sessione browser. **Le quotate restano coperte via
ESEF** (`filings.xbrl.org`), percorso separato e già funzionante.

### ❌ Croazia (HR) — login e CAPTCHA obbligatori

L'unico dataset "RGFI" su `data.gov.hr` si limita a rimandare alla pagina di login di
`rgfi.fina.hr`. Ogni azione, persino la ricerca del soggetto, richiede username/password
+ reCAPTCHA, con tetto di 50 download/giorno anche da autenticati. Nessuna alternativa
bulk aperta.

### ⚠️ Irlanda (IE) — indice gratuito, documento non trovato

`opendata.cro.ie`, portale CKAN. Dataset `financial-statements`, licenza **CC BY 4.0**,
annate 2022/2023/2024, tutte con DataStore attivo (interrogabili per azienda, senza bulk).

```
/api/3/action/datastore_search?resource_id=<2024>&limit=2
    → 230.410 righe
    CAMPI: file_name, company_num, company_name, submission_num,
           submission_rec_date, submission_eff_date, submission_reg_date,
           submissions_accounts_to_date
    esempio: file_name="130097420.pdf", PHELAN CASWELL INSURANCES LIMITED
```

**È l'indice dei depositi, non le cifre.** Tentata la risoluzione del PDF:
`opendata.cro.ie/documents/…` e `/files/…` → 404; `core.cro.ie/api/documents/…` → 403.

**Onestà sul limite di questa prova:** è "non trovato sondando tre URL", non "dimostrato
assente". Un endpoint documentato potrebbe esistere. Da chiarire prima di qualsiasi
decisione.

Anche come solo indice l'Irlanda vale più di oggi: 230k depositi l'anno con
identificativo azienda e date permettono di dire all'utente **quali esercizi esistono**,
mentre `coverage.ts` oggi la esclude e basta.

---

## Riepilogo per forma di integrazione

Le fonti non si dividono per paese ma per **forma**, e ogni forma ha un costo diverso:

| Forma | Paesi | Costo | Stato |
|---|---|---|---|
| Adapter a richiesta, documento | SK, GR | Basso | SK implementato, GR no |
| Pipeline ETL + storage, cifre | LV | Alto | Non implementato |
| Indice senza documento | IE, PL | Nullo per i bilanci | — |
| Bloccati (login/CAPTCHA/chiave) | HR, CZ, BE | — | — |

---

## Non ancora verificati — in ordine di valore atteso

1. **Svezia (SE)** — un report indica Bolagsverket in apertura gratuita per la direttiva
   UE sugli high-value datasets. Oggi in `NO_FREE_SOURCE`. Da verificare la data reale di
   attivazione.
2. **Belgio (BE)** — un report indica un'**API ufficiale NBB** (PDF/XBRL/CSV) al posto
   dello scraping HTML attuale. Sbloccherebbe il Belgio senza attendere l'approvazione
   manuale di `NBB_CBSO_CLIENT_ID`.
3. **Estonia (EE)** — già in `AUTO_ISOS` e funzionante, ma i documenti citano un dataset
   open 2019-2025 mai verificato per azienda: potrebbe fornire cifre strutturate oltre al
   PDF attuale.
4. **Finlandia (FI)** — **non compare in nessuno dei quattro documenti di progetto**, pur
   essendo in `CONSULT_PAGES`. Lacuna di copertura documentale, non solo tecnica.

---

## Dettaglio delle misure

Le verifiche complete, con output dei comandi, sono nei file di lavoro della sessione
2026-09-17 (`.superpowers/sdd/2026-09-17-company-finder-sblocco-paesi/`):
`progress.md` (ledger con 12 rulings), `docs-country-matrix.md` (24 paesi estratti dai
documenti di progetto, con le contraddizioni segnalate), `verify-lv-hr.md`.

Quella directory è git-ignored ed effimera: **questo file è la copia durevole**.
