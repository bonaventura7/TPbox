# Hungary (HU) — Company Finder: analisi tecnica e piano implementativo

## 0. Esito dell'analisi read-only: il vincolo che cambia l'obiettivo

Ho interrogato il registro ufficiale e-Beszámoló con la fixture fornita. Risultati misurati oggi:

1. La fixture `?b=...&so=1&o=...` risponde **200 con la pagina di errore «Hibás paraméterek!»** (parametri errati). I tre parametri sono legati alla sessione ASP.NET emessa al momento della ricerca (`Set-Cookie: ASP.NET_SessionId=...`), non sono deep-link stabili. Confermato: non vanno hardcodati, e nemmeno riusati.
2. La ricerca è `POST /Search/Results` (multipart) con esattamente un campo tra `firmNumber` (`\d{2}-\d{2}-\d{6}`), `firmTaxNumber` (prime 8 cifre dell'adószám) e `firmName` (min. 4 caratteri).
3. La stessa POST senza captcha risponde `{"errorText":"A reCaptcha kitöltése nem megfelelő."}`. Il portale usa un widget **ALTCHA** (`/Scripts/recaptcha.js`, `<altcha-widget>`): un controllo anti-bot proof-of-work obbligatorio prima di ogni ricerca, più una modale di accettazione delle condizioni d'uso.
4. Le risposte portano **`X-Frame-Options: DENY`**: la pagina ufficiale non è incorporabile in un iframe (il livello «consultazione incorporata» oggi dichiarato per HU non funziona).
5. Non esiste API pubblica di ricerca/download: `/fejlesztoknek` documenta solo il formato OBR per il *deposito*; l'unico canale dati massivo è una richiesta via e-mail con modulo cartaceo/PDF («Beszámoló állomány értékesítése»), manuale e non automatizzabile.

**Conseguenza onesta:** «Scarica bilancio» HU servito da un endpoint interno TPBox **non è realizzabile senza aggirare ALTCHA**, cosa che il vincolo del progetto vieta e che non farò. Il piano implementa quindi tutta l'architettura richiesta (adapter, resolver, allowlist, resilienza, verifica del file, stati separati) con HU che si ferma in modo **esplicito e verificabile** allo stato `SOURCE_RESTRICTION / CAPTCHA_REQUIRED`, invece di promettere un download che il registro nega. Se domani il portale espone un canale senza captcha, l'unico punto da cambiare è la `capability` dell'adapter: il resolver, il proxy e la UI sono già pronti.

## 1. Diagnosi — dove si rompe il flusso HU oggi

| File | Ruolo attuale | Difetto |
|---|---|---|
| `src/lib/company-finder/countries.ts` | HU: registro «Cégjegyzék (Cégkapu)», nota «accesso strutturato in espansione» | Registro sbagliato per i bilanci (è e-Beszámoló) e nota vaga |
| `src/lib/company-finder/coverage.ts` | HU in `CONSULT_PAGES` → livello B «consultazione incorporata» | Falso: `X-Frame-Options: DENY`. Manca un livello per «gratuito ma solo nel browser dell'utente» |
| `src/lib/company-finder/official-pages.ts` | HU cade nel ramo generico `CONSULT_PAGES` con CTA «Apri bilancio» e nota generica | Nessun ramo HU, nessuna istruzione operativa, nessun identificativo normalizzato |
| `src/lib/company-finder/orchestrator.ts` | `REGISTRY_ROUTES` e `FINANCIALS_ROUTES` non hanno voce HU | Nessuna fonte anagrafica né bilanci HU: HU arriva alla UI senza dati e senza stato |
| `src/lib/company-finder.functions.ts` | `prioritizeBalanceDocument` risolve solo GR; `browserRegistryResponse` solo GR/LU | Nessun ramo HU; nessuno stato di restrizione da propagare |
| `src/lib/company-finder/document-proxy.server.ts` + `src/routes/api.company-finder.document.ts` | Proxy `GET /api/company-finder/document?url=` con allowlist di host | Allowlist non contiene host HU; nessun controllo magic bytes/size prima dello streaming; retry/circuit breaker assenti; l'URL della fonte viaggia in chiaro nella query (visibile al client) |
| `src/routes/tool.company-finder.tsx` | `OfficialPageCard` con iframe + `FinancialsCard` con singolo `documentUrl` | Nessuna lista bilanci per anno/tipo/formato/stato; iframe inutilizzabile per HU |
| `src/lib/platform/resilience.server.ts` | timeout, retry lineare, circuit breaker, audit | Backoff senza jitter, non usato dal company-finder |
| Test | `test/company-finder-*.test.ts` (coverage, official-pages, proxy, DK/UK/FR/GLEIF) | Nessun test HU |

Route/server function già esistenti per il download: **solo** `GET /api/company-finder/document` (proxy generico). Nessuna route di elenco documenti, nessuna server function di acquisizione: vanno aggiunte.

## 2. Contratto dell'adapter HU

Nuovo modulo `src/lib/company-finder/registry/types.ts` (contratto generico, HU è la prima implementazione):

```text
type DocumentAvailability = "REGISTRY_ONLY" | "DOCUMENT_FOUND" | "DOCUMENT_DOWNLOADABLE"
type RestrictionCode = "CAPTCHA_REQUIRED" | "AUTH_REQUIRED" | "SESSION_BOUND"
                     | "SOURCE_RESTRICTION" | "RATE_LIMITED" | "SOURCE_UNAVAILABLE"

RegistryAdapter {
  iso, registryLabel, registryUrl
  normalizeIdentifiers(input) -> { cegjegyzekszam?, adoszam8?, name? }
  searchCompanies(input, ctx)          -> AdapterResult<CompanyMatch[]>
  getCompany(id, ctx)                  -> AdapterResult<CompanyProfile>
  listFinancialDocuments(id, ctx)      -> AdapterResult<FinancialDocumentRef[]>
  acquireDocument(ref, ctx)            -> AdapterResult<AcquiredDocument>
}

FinancialDocumentRef { id, year, kind, format, availability, restriction?, sourceRef (server-only) }
AcquiredDocument     { bytes, contentType, size, sha256, provenance{ registry, fetchedAt, correlationId } }
AdapterResult<T>     = { ok: true, data: T } | { ok: false, restriction, message, retryable }
```

`src/lib/company-finder/registry/hu-ebeszamolo.server.ts`:
- `normalizeIdentifiers`: `HU12345678`/`12345678` → `adoszam8`; `NN-NN-NNNNNN` → `cegjegyzekszam`; nome ≥ 4 caratteri → `name`. Nessun identificativo HU passa al VIES se non è una partita IVA valida per formato.
- `searchCompanies` / `listFinancialDocuments`: eseguono una **sonda di capacità** (una singola GET alla pagina di ricerca, con `withTimeout`, per accertare la presenza del widget ALTCHA e dell'header `X-Frame-Options`) e ritornano `{ ok: false, restriction: "CAPTCHA_REQUIRED", retryable: false }` finché il controllo esiste. Nessuna POST di ricerca senza token: non c'è tentativo di aggiramento.
- `acquireDocument`: implementata e collaudata, ma raggiungibile solo con un `sourceRef` prodotto da `listFinancialDocuments`; con la restrizione attiva non viene mai emesso alcun `sourceRef`, quindi ritorna `SESSION_BOUND`.
- `availability` HU = `REGISTRY_ONLY`.

## 3. Algoritmo di risoluzione e download (server-side)

1. `findCompany` (server fn esistente) → orchestrator; per `country === "HU"` aggiunge la route `hu-ebeszamolo` in `REGISTRY_ROUTES` e `FINANCIALS_ROUTES`.
2. L'adapter normalizza gli identificativi e chiama `listFinancialDocuments`.
3. Ogni `FinancialDocumentRef` restituito al client porta **solo** `{ id, year, kind, format, availability, restriction }` più un `documentToken` opaco. La mappa `documentToken → sourceRef` vive in una cache server-side a TTL (in memoria, chiave = hash del ref + correlation id): **nessun URL, cookie o token del registro raggiunge il browser**.
4. Nuova route `GET /api/company-finder/financial-document?token=...` (in `src/routes/api.company-finder.financial-document.ts`, logica in `document-resolver.server.ts`): risolve il token, valida l'host contro un'**allowlist esatta di hostname** (nessun wildcard, nessun IP letterale, protocollo `https:` obbligatorio, redirect seguiti solo se la destinazione è ancora in allowlist → SSRF protection), scarica e verifica.
5. Validazione del file prima di servire: `status === 200`, `content-type` atteso, **magic bytes** (`%PDF-`, `PK\x03\x04` per XLSX/OBR, `<?xml`/`<html` per XBRL/iXBRL), `size` ≤ 30 MB e > 1 KB, calcolo **SHA-256** e `provenance`. Risposta: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, header `X-Document-Sha256`.
6. Il proxy legacy `?url=` resta per DE/DK/NL/BE/UK/GR, ma passa dalla stessa funzione di validazione.

## 4. Errori e resilienza

- **Timeout** per hop: 8 s sonda, 45 s download.
- **Retry max 3** solo su errori idempotenti (429, 502/503/504, rete/timeout) con **exponential backoff + jitter** (`base 250 ms × 2^n ± 40%`); nessun retry su 4xx o su una restrizione.
- **Circuit breaker** per host (riuso di `resilience.server.ts`): 5 fallimenti in 60 s → aperto per 120 s, con risposta immediata `SOURCE_UNAVAILABLE`.
- **Idempotency**: il `documentToken` è la chiave; richieste ripetute nello stesso TTL servono il risultato in cache senza ricolpire il registro.
- **Fallback trasparente**: stato `SOURCE_RESTRICTION / CAPTCHA_REQUIRED` mostrato con motivazione esplicita, senza iframe (bloccato dal registro) e con le istruzioni operative reali: cerca per cégjegyzékszám / prime 8 cifre dell'adószám / denominazione ≥ 4 caratteri, completa la verifica anti-bot, apri l'anno desiderato, scarica il PDF/OBR.
- **Audit**: ogni tentativo registrato con `correlationId`, host, esito e codice di restrizione; mai l'URL firmato o i cookie.

## 5. Test RED da aggiungere (prima del codice)

`test/company-finder-hu.test.ts`
1. `normalizeIdentifiers`: `HU10773381` → `adoszam8`; `01-10-041683` → `cegjegyzekszam`; `"Tod"` (3 caratteri) → nessun `name`.
2. Un identificativo HU non conforme al formato IVA non viene passato al VIES (`runSearch` con fetch mockato).
3. `listFinancialDocuments` con la pagina di ricerca mockata (fixture ALTCHA) → `{ ok: false, restriction: "CAPTCHA_REQUIRED", retryable: false }`.
4. Fixture della pagina risultato con «Hibás paraméterek!» → `SESSION_BOUND`, mai `DOCUMENT_FOUND`.
5. Nessuna POST a `/Search/Results` viene emessa quando la restrizione è attiva (spy sul fetch).
6. `findCompany` per HU restituisce `availability: "REGISTRY_ONLY"` e una `officialPage` con `mode` esterno (nessun iframe).

`test/company-finder-document-resolver.test.ts`
7. Host fuori allowlist → 403; `http://`, IP letterale e redirect fuori allowlist → 403.
8. Content-type `application/pdf` ma corpo senza `%PDF-` → 502 e nessun byte servito.
9. File > 30 MB → 502; SHA-256 calcolato e coerente su una fixture valida.
10. Token inesistente/scaduto → 404; la risposta non contiene mai l'URL della fonte.
11. Backoff: tre tentativi su 503 poi errore; nessun retry su 404; breaker aperto → risposta immediata.

Aggiornamenti ai test esistenti: `company-finder-coverage.test.ts` (HU esce da `CONSULT_PAGES` ed entra nel nuovo livello «solo browser dell'utente», restando coperto), `company-finder-official-pages.test.ts` (ramo HU con URL ufficiale e istruzioni).

## 6. GREEN / REFACTOR

**GREEN**
1. `registry/types.ts` + `hu-ebeszamolo.server.ts` con la sonda di capacità.
2. `coverage.ts`: nuovo livello `BROWSER_ONLY` (HU) tenuto distinto da `CONSULT_PAGES` incorporabili; `isCovered` invariato nel risultato per HU.
3. `official-pages.ts`: ramo HU (`https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses`, `mode: "external"`, istruzioni numerate, CTA «Apri il registro ufficiale»).
4. `types.ts`: `availability`, `restriction`, `FinancialDocumentRef[]` su `Financials`; `OfficialPageRef` con `mode` e `instructions`.
5. `orchestrator.ts`: route HU in `REGISTRY_ROUTES`/`FINANCIALS_ROUTES`; nessun identificativo HU non-IVA al VIES.
6. `document-resolver.server.ts` + route `api.company-finder.financial-document.ts`; validazione condivisa col proxy esistente.
7. UI: nuova `FinancialDocumentsList` (anno / tipo / formato / stato) con azione interna «Scarica bilancio» quando `DOCUMENT_DOWNLOADABLE`, e banner di restrizione con istruzioni quando `REGISTRY_ONLY`; iframe non renderizzato per `mode: "external"`.
8. `countries.ts`: nota HU corretta (e-Beszámoló, gratuito, ricerca protetta da verifica anti-bot).

**REFACTOR**
- Spostare `resilience` (backoff+jitter, breaker) in un helper condiviso e farlo usare anche dal proxy legacy.
- Ricondurre GR/LU/PL al medesimo contratto `RegistryAdapter` **solo** dopo che HU è verde, in un intervento separato (nessun cambio di comportamento per GR/LV/CZ/EE in questo intervento).

## 7. Criteri di accettazione e rollback

**Accettazione**
- Ricerca HU per nome, cégjegyzékszám o adószám: la scheda mostra registro corretto, stato `REGISTRY_ONLY` con motivo `CAPTCHA_REQUIRED` e istruzioni; nessun iframe, nessuna promessa di download.
- Nessun parametro `b/so/o` presente nel codice sorgente (test dedicato con grep sul repository).
- Nessun URL, cookie o token del registro nel payload inviato al client (test sulla risposta di `findCompany`).
- Il resolver serve un documento solo con status/content-type/magic bytes/size validi, SHA-256 e provenienza; allowlist esatta con SSRF coperto dai test.
- Suite completa verde (attuali 260 test + i nuovi), `tsgo --noEmit` pulito, nessuna nuova dipendenza, nessuna modifica a Supabase/schema.

**Rollback**
- Le modifiche sono additive e isolate ai file elencati: rimuovere la route HU da `REGISTRY_ROUTES`/`FINANCIALS_ROUTES` e riportare HU in `CONSULT_PAGES` ripristina il comportamento attuale; il nuovo endpoint e i nuovi moduli possono essere eliminati senza toccare DE/NL/DK/UK/FR/GR/BE/PL.

## Nota tecnica (per il seguito)

Se in futuro si volesse un download HU davvero automatico, le sole strade lecite sono: (a) il canale dati massivo del Céginformációs Szolgálat, che oggi passa da un modulo inviato per e-mail e non è un'API; (b) una richiesta formale di accesso programmatico al Ministero. Entrambe sono decisioni tue, non tecniche, e restano fuori da questo intervento.
