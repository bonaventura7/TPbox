# Greece GEMI financials — implementation plan

## Obiettivo
Rendere la Grecia (`GR`, VAT prefix `EL`) realmente supportata dal Company Finder per bilanci/documenti finanziari gratuiti, senza considerare un semplice 200 della scheda aziendale come successo finanziario.

## Evidenze interne
- La documentazione interna conferma l'OpenData GEMI ufficiale su `opendata-api.businessportal.gr`, base `/api/opendata/v1`, con `api_key` obbligatoria; endpoint documentale `/companies/{arGemi}/documents` e download `/downloadFile` sono documentati.
- La stessa fonte interna conferma che la pagina pubblica `https://publicity.businessportal.gr/company/{arGemi}` risponde 200 senza chiave, ma può essere protetta da reCAPTCHA per automazione ad alto volume.
- Nel repository esiste già `src/lib/company-finder/greek-filing.ts`, che estrae un link iXBRL da una pagina pubblica, ma non risulta collegato all'orchestratore.
- `document-resolver.server.ts` ha già allowlist, token opachi, redirect validation, timeout, retry/backoff/jitter, circuit breaker, magic-byte validation e SHA-256; sono già inclusi `filings.businessportal.gr` e `publicity.businessportal.gr` nell'allowlist.
- `countries.ts` dichiara GR come non-free strutturato, quindi la copertura UI va corretta dopo l'implementazione.
- `orchestrator.ts` importa fonti bilanci per altri paesi ma non importa `greek-filing.ts`: la Grecia è quindi parzialmente predisposta ma non cablata.

## Strategia
1. **RED** — estendere i test Greece con casi reali e capability-aware:
   - estrazione di più filing iXBRL, non solo il primo;
   - normalizzazione di URL HTML encoded;
   - nessun falso positivo sulla sola pagina company;
   - identificazione del documento finanziario e metadati anno/titolo quando presenti.
2. **GREEN** — aggiungere un adapter Greece nel layer `sources/bilanci`, riusando `greek-filing.ts` solo come primitive di discovery.
3. **Capability-aware cascade**:
   - OpenData GEMI ufficiale quando `GEMI_API_KEY` è disponibile: company → documents → file;
   - fallback pubblico GEMI: company page → filing iXBRL diretto;
   - se il filing è noto ma il download automatico è bloccato/restricted, restituire `DOCUMENT_FOUND` + `OfficialPageRef`, non un falso `DOCUMENT_DOWNLOADABLE`;
   - usare GLEIF/VIES solo per risoluzione identità, mai come prova di bilancio.
4. **GREEN orchestrator** — collegare GR/EL alla nuova fonte, usando GEMI come fonte primaria dei financials e preservando il resto della regia.
5. **Security/HA** — nessun bypass CAPTCHA/auth; timeout e retry solo per operazioni GET idempotenti; allowlist già esistente; propagare restriction codes; evitare URL sorgente nel payload client quando si usa il document proxy.
6. **Config** — aggiungere `GEMI_API_KEY` e base endpoint documentato a `.env.example`, senza inserire segreti.
7. **UI metadata** — aggiornare `countries.ts` a `financials.free: true` solo per la capacità effettivamente implementata e documentare le limitazioni della fonte pubblica.
8. **Validation** — `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, quindi smoke test Vercel preview. Nessun deploy production finché il quality gate non è verde.

## File previsti
- `src/lib/company-finder/sources/bilanci/gemi-gr.ts` — nuovo adapter GEMI.
- `src/lib/company-finder/sources/bilanci/gemi-gr.test.ts` — test TDD.
- `src/lib/company-finder/greek-filing.ts` — discovery iXBRL più robusta se necessaria.
- `src/lib/company-finder/greek-filing.test.ts` — test discovery.
- `src/lib/company-finder/orchestrator.ts` — wiring GR.
- `src/lib/company-finder/countries.ts` — stato/capability GR.
- `.env.example` — configurazione non segreta.
- `docs/superpowers/plans/2026-09-09-greece-gemi-financials.md` — questo piano.

## Criteri di successo
- Ricerca GR/EL con GEMI/VAT identifica la società.
- Se sono disponibili filing finanziari pubblici, `financials.available === true` e almeno un `documents[]` coerente viene restituito.
- Un documento scaricabile è marcato `DOCUMENT_DOWNLOADABLE` solo quando il proxy può acquisirlo e validarlo.
- In caso di CAPTCHA/auth/restrizione viene dichiarato il limite e non viene tentato alcun bypass.
- I test coprono primary/fallback/restriction/error path.
- L'intera suite e build passano.
