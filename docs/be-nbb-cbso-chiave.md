# Belgio — chiave NBB-CBSO: guida operativa

La catena Belgio è implementata end-to-end sul ramo di fix. Per ottenere dati reali dal gateway NBB CBSO serve una chiave di sottoscrizione autorizzata; il codice non contiene né espone credenziali.

## 1. Cosa è pronto

- `fetchCbsoAccounts` risolve i riferimenti di deposito dal CBE e costruisce un URL same-origin del proxy con `accept=application/pdf`.
- `handleDocumentRequest` inietta `NBB-CBSO-Subscription-Key` e `X-Request-Id` solo lato server per `ws.cbso.nbb.be` e `ws.uat2.cbso.nbb.be`.
- La route `/api/company-finder/document?url=...` inoltra i documenti ufficiali al proxy generico, mantenendo allowlist SSRF e protezioni esistenti.
- `test/company-finder-be-cbso.test.ts` copre la catena senza accesso rete.

Senza chiave, il comportamento previsto è degradata-elegante: il resolver segnala `skipped` e il proxy restituisce 503 esplicito, senza chiamare il gateway in modo anonimo.

## 2. Produzione NBB CBSO

1. Richiedi l'accesso a **Authentic Data Query** tramite il portale NBB.
2. Completa attivazione e sottoscrizione dal developer portal CBSO.
3. Recupera la chiave primaria dal profilo tecnico.
4. Configura in Vercel la variabile server-side `NBB_CBSO_API_KEY` per Production; configura Preview solo se serve testare il ramo prima del merge.
5. Non impostare `NBB_CBSO_BASE` in produzione: il default è `https://ws.cbso.nbb.be`.
6. Esegui un nuovo deployment.

## 3. UAT2

Per un test controllato si può usare `https://ws.uat2.cbso.nbb.be` con una chiave UAT2. I dati UAT2 non devono essere trattati come prova dell'archivio reale.

## 4. Verifica end-to-end

Caso di riferimento: **BEAULIEU International Group**, CBE `0442824497` / VAT `BE0442824497`.

Atteso:

1. risoluzione della società;
2. chiamata NBB `/authentic/legalEntity/0442824497/references`;
3. selezione del deposito più recente;
4. URL same-origin `/api/company-finder/document?...accept=application/pdf`;
5. HTTP 200 del documento con `Content-Type: application/pdf` e firma `%PDF-` quando la chiave è configurata.

## 5. Sicurezza

- La chiave non deve comparire in URL, HTML, log, test fixture di produzione o risposta HTTP.
- Il proxy accetta solo host esplicitamente allowlisted.
- I redirect vengono rivalidati contro la stessa allowlist.
- Timeout, dimensione massima e validazione PDF restano attivi.

## 6. Fallback operativo

Se NBB non è configurato o temporaneamente indisponibile, non inventare dati finanziari. Conservare la scheda CBE/KBO e presentare il collegamento alla consultazione ufficiale NBB come fallback. Pappers può essere usato come oracle/regression reference, non come sostituzione silenziosa della fonte ufficiale NBB.
