# ADR · Scelta dell'MCP server Vinted (flusso HA su API non ufficiali)

Data: 2026-09-16 · Stato: **ACCEPTED** · Autore: Senior Solutions Architect
Fonti verificate il 16/09/2026 su glama.ai (directory MCP), registry.npmjs.org, GitHub API (repo, star, commit, CI).

---

## 0. Risposta breve

> **Il miglior MCP "Vinted" oggi è [`googlarz/vinted-mcp-cli`](https://glama.ai/mcp/servers/googlarz/vinted-mcp-cli)
> (`@googlarz/vinted-client`) per tutto ciò che è lettura: ricerca, confronto prezzi multi-Paese, trending,
> anagrafica venditore.** MIT, attivo (ultimo push 2026-09-03), CI dei test verde su Node 18/20/22, ed è l'unico
> che ha **già dentro** le difese che su un'API non ufficiale sono la differenza tra un flusso usabile e un IP
> bruciato: token bucket per Paese, cache LRU+TTL, re-bootstrap su 401, fallback HTML quando DataDome blocca il
> JSON, `--proxy`. E consegna tre superfici con un solo pacchetto: MCP + CLI + libreria TypeScript.
>
> **Se il requisito è HA in produzione senza manutenzione, il primary path diventa managed:**
> `lowlanddata/vinted-scraper` su Apify, esposto come MCP HTTP (`https://mcp.apify.com/?tools=fetch-actor-details,lowlanddata/vinted-scraper`).
> Costa per risultato e sposta la guerra contro DataDome/proxy su un fornitore.
>
> Per le **scritture** (bozza annuncio, prezzo, messaggi) il progetto con il design più maturo è
> `rachid598/vinted-seller-mcp` (27 tool, pubblicazione con `confirm: true` + `destructiveHint`). **Ma oggi non è
> installabile**: repo GitHub `rachid598/mcpvin` risponde 404 e il pacchetto non esiste su npm → **non installare
> alla cieca**: nessun sorgente verificabile = nessun audit possibile. Va replicato il *pattern*, non il pacchetto.

Motivazione strutturata sotto. Le regole del gioco prima dei nomi.

---

## 1. Brainstorming / vincoli non negoziabili

### 1.1 Il vincolo madre: non esiste un'API pubblica Vinted

| Fatto | Conseguenza di architettura |
|---|---|
| Vinted non pubblica API, SDK o developer portal | ogni MCP è **reverse engineering** dell'API JSON interna `/api/v2/...` usata dal web app |
| Il catalogo è leggibile senza login, ma l'accesso automatizzato è vietato dai ToS | rischio **contrattuale** (ban dell'account/IP), non penale; le scritture autenticate sono le più rischiose |
| Protezione DataDome (+ Cloudflare/TLS fingerprint) | da IP datacenter i blocchi arrivano dopo poche decine di richieste; servono IP residenziali e fingerprint reale |
| `401` = cookie di sessione scaduto, `403` = sfida del WAF, `429` = rate limit | **non sono la stessa cosa**: retry sul 403 peggiora il ban; il 401 va gestito ri-facendo bootstrap, non riprovando a caso |
| Esiste una **Vinted Pro API** ufficiale (`pro-docs.svc.vinted.com`) | unica via contrattualmente pulita, ma richiede account Pro (~30 €/mese) **e** approvazione manuale su allowlist interno: non raggiungibile da un progetto side |

**Implicazione:** nessun MCP Vinted è "stabile per contratto". La resilienza non è una feature, è il prodotto.
La scelta tecnica non è "quale tool fa più cose", ma **"quale tool degrada meglio quando Vinted cambia"**
(che accadrà: è già accaduto a più riprese agli scraper storici).

### 1.2 Criteri di valutazione e pesi

Pesi decisi a priori (sommano a 100), punteggio 0–5 per criterio.
`punteggio = Σ(pesoᵢ × votoᵢ) / 100`, poi normalizzato a percentuale su 5.

1. **manutenzione 18** — attività reale del repo (push, issue, release), non la data del listing Glama
2. **funzionalità 18** — copertura dei casi d'uso (ricerca, dettaglio, venditore, confronto, scritture)
3. **resilienza nativa 16** — rate limit, cache, retry, breaker, fallback anti-WAF, gestione 401
4. **sicurezza & human-in-the-loop 14** — gestione credenziali, conferma esplicita sulle operazioni distruttive
5. **licenza 10** — MIT/Apache = ok; AGPL = contagio se il flusso finisce dentro un portale erogato come servizio; nessuna licenza = **blocco**
6. **reperibilità del sorgente / supply chain 12** — pacchetto npm + repo pubblico + manutentore identificabile
7. **sforzo di integrazione 12** — numero di passi per andare in prod (build, Chromium, login manuale)

---

## 2. Shortlist valutata (dati raccolti, non opinioni)

| # | Candidato | Stars | Ultimo push | Pacchetti | Glama (license/quality/maintenance) | Note chiave raccolte oggi |
|---|---|---|---|---|---|---|
| 1 | `googlarz/vinted-mcp-cli` | 7 | 2026-09-03 | `@googlarz/vinted-client@1.1.4` (npm) | A / A / B | 12 tool MCP, 19 Paesi, CLI+lib+MCP; test CI ✅, **job `publish` ❌** → npm è fermo a 1.1.4 mentre su GitHub c'è `v1.1.5` |
| 2 | `Apify lowlanddata/vinted-scraper` (managed MCP) | n/d (vendor) | n/d | Actor Apify + `mcp.apify.com` | (connector Glama `com.lowlanddata/resale`) | 23 mercati, ~1,50–2,40 $/1000 risultati, **zero dati venditore** by design, pay-per-result |
| 3 | `rachid598/vinted-seller-mcp` (mcpvin) | 27 (Glama) | 2026-08-17 (Glama) | **non su npm** | A / A / B | 27 tool, draft→validate→publish con conferma obbligatoria, auth via profilo Chromium (mai la password). **Repo 404** |
| 4 | `andrijdavid/vinted-mcp` | 15 | 2026-08-13 | `@andrijdavid/vinted-mcp@0.1.2` | A / – / C | ha il **transport Streamable HTTP** (`VINTED_MCP_TRANSPORT=http`) + cookie manuali per CI; **AGPL-3.0**; npm 0.1.2 di aprile vs README che punta a `@next` |
| 5 | `Rbillon59/vinted-mcp-server` | 0 (repo) | 2026-04-05 | `@rbillon59/vinted-mcp-server@0.2.0` | A / A / D | dipinge di stealth: `puppeteer` + `puppeteer-extra-plugin-stealth` → 300 MB di browser e fragilità; LICENSE assente nel repo benché Glama dica MIT |
| 6 | `grappaheiss/VRO Camoufox MCP` | 0 | 2026-08-23 | non pubblicato | F / A / B | read-only con **evidence capture** (snapshot/prove) — pregio raro, ma **nessuna licenza** |
| 7 | `Gertje823/Vinted-Scraper` | 144 | **2024-08-18** | no (Python) | A / – / **F** | MCP-only non è (è uno scraper + SQLite), disclaimer "educativo", GPL-3.0: **scartato** |
| — | Alternative a margine: `Crawlora MCP` (`vinted_brand`), `flipradar/Resell Pro`, `market-data-toolkit-mcp`, `Scrappa` (REST a chiave, 10 endpoint), `gniax/revinted` (estensione+bot per ripubblicare) | | | | | utili come *seconda opinione* sui prezzi, non come primary |

### 2.1 Griglia ponderata

| Candidato | manut. 18 | funz. 18 | resil. 16 | sic. 14 | lic. 10 | reper. 12 | effort 12 | **/5** | **%** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Apify `lowlanddata/vinted-scraper` (managed) | 5 | 3 | 5 | 4 | 4 | 5 | 5 | **4.40** | **88.0%** |
| `googlarz/vinted-mcp-cli` | 4 | 4 | 5 | 4 | 5 | 4 | 5 | **4.38** | **87.6%** |
| `rachid598/vinted-seller-mcp` | 3 | 5 | 4 | 5 | 5 | 1 | 2 | 3.64 | 72.8% |
| `andrijdavid/vinted-mcp` | 3 | 4 | 3 | 3 | 1 | 4 | 4 | 3.22 | 64.4% |
| `Rbillon59/vinted-mcp-server` | 2 | 3 | 3 | 3 | 4 | 2 | 4 | 2.92 | 58.4% |
| `grappaheiss/VRO Camoufox MCP` | 3 | 2 | 4 | 4 | 0 | 2 | 3 | 2.70 | 54.0% |
| `Gertje823/Vinted-Scraper` | 0 | 2 | 2 | 2 | 2 | 4 | 2 | 1.88 | 37.6% |

Aritmetica esplicita dei due primi classificati (per non discutere di sensazioni):

- Apify: `(18×5 + 18×3 + 16×5 + 14×4 + 10×4 + 12×5 + 12×5) = 440` → 440/100 = **4.40/5 = 88.0%**
- googlarz: `(18×4 + 18×4 + 16×5 + 14×4 + 10×5 + 12×4 + 12×5) = 438` → 438/100 = **4.38/5 = 87.6%**

**Lettura da architetto:** 2 punti su 100 non sono un vantaggio tecnico, sono il prezzo del canone. Quindi non
scegliamo "il più alto in classifica", ma **due livelli con ruoli diversi**:

- **Tier A — interattivo/dev, costo marginale zero, dati non critici:** `googlarz/vinted-mcp-cli` + shim locale.
- **Tier B — pipeline ricorrente con SLA implicita e nessun manutentore interno:** Apify managed MCP.
- **Tier C — scritture:** **non** si automatizzano con questi tool. Human-in-the-loop obbligatorio (vedi §4.3).

### 2.2 Perché googlarz vince tra gli open

1. **Parla la lingua del problema.** Il README dichiara esplicitamente: bootstrap del cookie da `vinted.{cc}/catalog`,
   chiamata a `/api/v2/...`, **re-bootstrap automatico su 401**, token bucket per Paese, LRU+TTL (60 s per le
   ricerche, 1 h per le categorie), **fallback a scraping HTML con JSON-LD quando DataDome blocca l'item page**,
   prefetch di 3 pagine in `opSearchAll`. Sono esattamente i 7 meccanismi che un'architettura HA pretenderebbe di
   scrivere a mano sopra un client ingenuo.
2. **Una sola dipendenza runtime** (`commander`, `undici`) contro l'ecosistema Playwright/puppeteer dei concorrenti:
   superficie d'attacco e tempo di avvio ordin di grandezza inferiori, e funziona dove un browser non parte (CI, Vercel/serverless).
3. **Tre interfacce, un solo core**: MCP (`npx -y @googlarz/vinted-client/mcp`), CLI (`vinted search … --output json`),
   libreria TS (`opSearch`, `opCompare`, `opSearchAll`). Significa che il *tool* che usa l'agente e il *batch* che
   usa il backend condividono la stessa semantica → nessun drift tra "cosa vede il modello" e "cosa persiste il DB".
4. **12 tool MCP con TDQS A** (4.2/5 su `compare_prices`): descrizioni con output, default e side effect dichiarati.
   È ciò che riduce le chiamate sbagliate dell'LLM, cioè il vero costo occulto di un MCP.

Caveat onesti (e mitigati al §4): **7 star, manutentore singolo** (bus factor 1), 12 download/settimana npm,
release GitHub `v1.1.5` pubblicata ma **job `publish` in failure** → npm resta a 1.1.4. Regola pratica:
**mai `@latest` in produzione**, versionare e, se serve l'ultima, installare dal tag.
Infine i suoi 12 tool MCP **non hanno `annotations`** (`readOnlyHint`/`destructiveHint` assenti): un client non può
dedurre la natura delle operazioni dai metadati. È il motivo per cui lo shim di §4.1 le dichiara esplicitamente.

---

## 3. Cosa scarta la due diligence (e perché è la parte utile)

- **`vinted-seller-mcp` (rachid598)** — ha il **design giusto** per le scritture: `publish_listing`, `delete_listing`,
  `send_message` richiedono `confirm: true` e sono marcati `destructiveHint`; il vincolo è nello **schema del tool**,
  non nel prompt ("a model that has drifted still cannot publish by accident"). Login via profilo Chromium
  (`~/.vinted-seller-mcp/profile-fr/`): il tool **non vede mai la password** e non tenta di bypassare CAPTCHA/2FA.
  `estimate_price` restituisce distribuzione + 3 prezzi + confidenza e **si rifiuta di essere preciso sotto 3
  comparabili** (`insufficient_data`), con l'elenco dei comparabili scartati e il motivo → prezzo difendibile.
  **Ma:** repo 404, pacchetto non su npm, install via `git clone` di un placeholder (`github.com/<owner>/…`).
  Verdetto: **pattern da adottare, artefatto da non installare**. Se l'autore ripubblica, rivalutare subito: la
  sua funzione di stima prezzo è migliore di qualsiasi cosa faccia googlarz.
- **`andrijdavid/vinted-mcp`** — tecnicamente interessante (HTTP transport nativo, auth a cookie per CI, `VINTED_MAX_CONCURRENCY`,
  `VINTED_MAX_RETRIES`), ma **AGPL-3.0** in un portale erogato come servizio è un debito legale che nessuno paga
  volentieri, e il divario npm(0.1.2, aprile)↔README(`@next`) dice che il flusso di rilascio è instabile. Scartato come primary, **recuperabile come reference** per il trasporto HTTP.
- **`Rbillon59/vinted-mcp-server`** — maintenance D, 0 star sul repo, Stealth-plugin: è la versione "fragile e
  pesante" dello stesso problema. No.
- **`Gertje823/Vinted-Scraper`** — fermo ad agosto 2024, 17 issue aperte, GPL, disclaimer "solo didattico":
  su un mercato che cambia gli endpoint è già morto. No.
- **`grappaheiss/VRO Camoufox MCP`** — unica idea *governance* della shortlist (read-only + **evidence capture**).
  Senza licenza non è riutilizzabile in un progetto con audit. Rubare l'idea: **conservare la risposta grezza e
  l'hash come prova di ogni rilevazione prezzo**.

---

## 4. Architettura raccomandata

```
                          ┌──────────────────────────────────────────────┐
 Agente (Claude/Cursor)   │  MCP: googlarz/vinted-mcp-cli  (stdio)       │  Tier A · read-only
        │                 │  npx -y @googlarz/vinted-client/mcp          │  costo marginale 0
        ▼                 └───────────────┬──────────────────────────────┘
 ┌─────────────────┐                      │
 │  MCP client     │                      ▼
 │  (config §runbook)            ┌───────────────────────────┐   CLI/JSON   ┌────────────────────┐
 └─────────────────┘             │ tools/vinted/vinted_      │─────────────▶│ vinted.{cc}/api/v2 │
        │                        │ gateway.py  ← shim HA     │              │  (DataDome)        │
        │ Tier B (batch/SLA)     │ cache·bucket·breaker·     │◀─────────────└────────────────────┘
        └───────────────────────▶│ budget·audit·stale-error  │
                                 └───────────┬───────────────┘
                                             │ HTTPS (nessun browser locale)
                                 ┌───────────▼───────────────────┐
                                 │ Apify mcp.apify.com           │  Tier B · managed
                                 │ lowlanddata/vinted-scraper    │  $/1000 risultati
                                 └───────────────────────────────┘
```

### 4.1 I controlli di resilienza (implementati e testati in `tools/vinted/vinted_gateway.py`)

| # | Controllo | Perché è quello giusto qui | Parametro di default |
|---|---|---|---|
| 1 | **Token bucket per Paese** | il rate limit di Vinted è per-mercato/IP: un bucket globale fa esplodere `429` a raffica | 0.5 req/s, burst 2 |
| 2 | **Cache con TTL per tipo di dato** | tassonomia (brand, categorie) non cambia in giornata → 86 400 s; listini → 600 s. Meno chiamate = meno ban | `VINTED_GATEWAY_TTL_SCALE` |
| 3 | **Stale-while-error** | a monte rotto, l'agente deve poter dire *"ultimo dato alle 14:02, potrebbe essere non aggiornato"*, non *"errore"*. Coerente con gli stati `stale`/`service degraded` già usati nel portale | `degraded: true` + `stale_age_s` |
| 4 | **Circuit breaker per Paese, persistente** | un processo per chiamata ⇒ un breaker in memoria non apre **mai**. Persistito su file con `flock`, N invocazioni condividono la stessa protezione | 4 fallimenti → open 90 s → 1 probe half-open |
| 5 | **Retry con backoff + jitter solo su errori ritentabili** | `429`/`5xx`/`timeout`/`401` → sì; **`403` DataDome e `404` → no** (riprovare su un challenge WAF allunga il ban) | max 2 retry |
| 6 | **Budget anti-loop** | il rischio numero uno di un MCP dentro un agente non è "non funziona", è "funziona e spreme l'IP". Tetto di chiamate/min a livello di host | 60 chiamate/min |
| 7 | **Kill switch + nessuna scrittura esposta** | `VINTED_GATEWAY_DISABLE=1` spegne il flusso senza redeploy; `publish/delete/message` **non esistono** nello shim | feature flag |
| 8 | **Escalation `--browser` sugli item bloccati** | il CLI a monte ha un fallback stealth: su `403` il gateway riprova **una** volta così, senza sporcare il breaker | `VINTED_GATEWAY_ESCALATE_BROWSER` |
| 9 | **`raw` pass-through a whitelist** | i flag che l'upstream aggiungerà non obbligano a forkare; ma `debug` (stampa i cookie di sessione) e ogni verbo di scrittura sono rifiutati prima della rete, e `--max-pages`/`--max-items` sono capsati per non aggirare il budget | whitelist di 8 sottocomandi |
| 10 | **Retry interrotto quando il breaker scatta** | se l'errore corrente raggiunge la soglia, il loop si ferma: continuare a riprovare a circuito aperto è ciò che trasforma un 429 in un ban da 24 h | comportamento verificato dal test |

In più: **pacing cross-process** (intervallo minimo reale tra due chiamate, altrimenti il limiter è cosmetico),
`--explain` (piano senza effetti: argv, cache key, TTL — utile alla review e ai test di contratto), audit NDJSON con
`correlation_id`, e `_trim` che limita gli item per risposta (**contesto dell'LLM = denaro**: 96 item × 3 Paesi di
giro a ogni turno bruciano token e aumentano le allucinazioni sui prezzi).

Lo shim espone a sua volta un server MCP (`vinted_gateway.py mcp`, 9 tool, tutti `readOnlyHint`/`idempotentHint`,
`additionalProperties:false`, nessun tool di scrittura presente): l'agente non parla con il client di terze parti,
parla con il gateway. Così cache, budget, breaker e audit valgono **anche** quando l'MCP upstream viene sostituito
dal Tier B, che è il vero requisito di lungo periodo (vedi §5).

### 4.2 Capacity & cost math (per non decidere "a naso")

Ipotesi: 96 item max per pagina, target 0.5 req/s per Paese, 4 Paesi in parallelo.

| Grandezza | Calcolo | Valore |
|---|---|---|
| Capacità di rilevazione | 0.5 × 4 Paesi × 3600 s | **7 200 chiamate/h ≈ 691 k item/giorno** |
| Indagine pricing "vera" | 200 SKU × 4 Paesi = 800 chiamate ÷ 0.5 rps | **≈ 27 min** (con cache, re-run in giornata ≈ 0) |
| Costo managed (Apify) | risultati × ($1.50–2.40 / 1000) | 240 k risultati/mese ≈ **$360–576/mese** |
| Costo DIY | proxy residenziali €150 + 3 h×€50 manutenzione | **≈ €450/mese** (+ setup €750–1 250 una tantum) |
| **Break-even** | €450 ÷ €1.85/1 000 risultati | **≈ 243 k risultati/mese** |

Conseguenza operativa: **sotto ~240 k risultati/mese il managed è oggettivamente più economico** (e non ti svegli
quando DataDome cambia); **sopra, conviene l'hardware proprio** — cioè il Tier A qui sopra, con proxy tuo.
Chi dice "gli MCP free sono sempre più economici" non ha messo nel conto le ore di manutenzione.

### 4.3 Scritture: la posizione formale

1. **Nessuna pubblicazione automatica di annunci** con MCP di terze parti: il rischio non è tecnico (banning
   dell'account *umano*, che è il tuo asset), è di prodotto.
2. Flusso ammesso, mutuato da `vinted-seller-mcp`: `ricerca comparabili → stima → bozza locale → review umana →
   validazione form → (click umano) publish`. Il gate sta **nello schema del tool**, non nel prompt.
3. Se il volume di vendita lo giustifica: **Vinted Pro API** ufficiale (account Pro + allowlist). Unica via con un
   contratto sotto i piedi; qualsiasi altra via è tollerata, non autorizzata.

### 4.4 Compliance (GDPR / ToS) — breve ma non opzionale

- **Dato personale minimo**: `get_user_profile`/`seller` restituisce username, rating, città. Trattare come dato
  personale: nessuna persistenza di profilo/venditore in DB senza base giuridica documentata; **mai** aggregare
  identità + prezzi per "monitoraggio concorrenti" senza review legale.
- **Scelta Apify per questo motivo**: l'Actor dichiaratamente non estrae dati venditore.
- **Licenze**: niente AGPL (`andrijdavid`) nel perimetro del portale; niente codice senza licenza (`camoufox`);
  `vinted-seller-mcp` **non riutilizzabile** finché il sorgente non è ispezionabile.
- **Supply chain**: pin esatto (`@googlarz/vinted-client@1.1.4`, non `@latest`), `npm audit` in CI, lockfile
  committato, nessun `postinstall` non ispezionato (i pacchetti stealth scaricano Chromium da CDN).

---

## 5. Decisione (una riga per ruolo)

| Contesto | Scelta | Motivo in 5 parole |
|---|---|---|
| Claude Desktop/Cursor, ricerca e pricing ad personam | **googlarz `npx -y @googlarz/vinted-client/mcp`** | zero setup, resiliente, MIT |
| Repository/pipeline che deve reggere | **Apify `lowlanddata/vinted-scraper` via `mcp.apify.com`** | vendor paga DataDome |
| Frontend/agente che consuma dati "di mercato" | **`tools/vinted/vinted_gateway.py` davanti a entrambi** | cache+breaker+budget |
| Pubblicazione annunci | **manuale, con bozza generata offline** | account umano = asset |
| Reference per transport HTTP/cookie in CI | `andrijdavid/vinted-mcp` *(solo lettura del codice, non come dipendenza)* | ha l'HTTP nativo |

**Anti-pattern da evitare esplicitamente** (sono i fallimenti che vedo più spesso):
`@latest` in prod; loop di retry sul 403; cache condivisa tra Paesi; prompt "chiedi il permesso" al posto di un
gate nello schema; MCP che fa `fetch` dal browser dell'utente (segreto + CORS + audit impossibili); far
calcolare le statistiche di prezzo al modello invece che a una funzione deterministica testata.

---

## 6. Verifica fatta (riproducibile)

```bash
# shortlist + segnali di salute, non marketing
gh api repos/googlarz/vinted-mcp-cli --jq '{stars:.stargazers_count,pushed:.pushed_at,issues:.open_issues_count}'
gh api repos/googlarz/vinted-mcp-cli/commits/main/check-runs --jq '.check_runs[]|{name,conclusion}'
gh api repos/rachid598/mcpvin        # → 404: il candidato "seller" non è installabile
curl -s https://registry.npmjs.org/@googlarz%2Fvinted-client | jq '.["dist-tags"], (.versions|keys|length)'
# → latest 1.1.4 (2026-05-06) vs GitHub release v1.1.5 (2026-09-03): npm lagga
```

36 unit test coprono gli invarianti del §4.1 (cache, stale-while-error, breaker persistente half-open,
retry interrotto quando il circuito scatta, non-ritentabilità del 403, budget, pacing fra due processi,
contratto del server MCP, e i numeri della statistica prezzo verificati a mano):

```bash
python3 -m unittest discover -s tools/vinted -p 'test_*.py'   # → OK (36 test, ~5 s, offline)
```

---

## 7. Verifica empirica (sandbox, 2026-09-16, Node 22 / Python 3.11)

Non mi sono fidato dei README: ho eseguito i candidati. Risultati che cambiano le istruzioni di installazione.

| Test | Esito | Conseguenza |
|---|---|---|
| `npx -y @googlarz/vinted-client@1.1.4 search …` (forma del README) | ❌ `could not determine executable to run` | il pacchetto ha 2 bin → serve `-p <pkg> <bin>` |
| `npx -y @googlarz/vinted-client@1.1.4/mcp` | ❌ nessun output, handshake mai iniziato | copiare il README = MCP che "non parte", con errore silenzioso |
| `npx -y -p @googlarz/vinted-client@1.1.4 vinted <cmd> --help` | ✅ 9 sottocomandi | flag reali: `--limit 1..100` (oltre serve `--all`), `-c/--country` con enum di 19 codici, `item --browser` (fallback stealth anti-DataDome), `seller`/`seller-items`/`trending`/`brands` accettano `--country`/`--limit` |
| `… vinted-mcp` + `initialize` | ✅ `tools/list` → 12 tool, tutti `readOnly` | ❌ `annotations` assenti su tutti i tool |
| `initialize` senza `clientInfo.version` | ❌ `-32603` da Zod strict | alcuni client MCP omettono `version`: prevedere l'errore |
| egress reale da IP datacenter (`vinted search`) | ❌ `error: fetch failed` | **conferma il §1.1**: senza proxy residenziale non c'è flusso; lo shim degrada in 3 tentativi, 3,57 s, `reason=transient`, rc=5 |
| 2ª chiamata a monte rotto | `attempts=1` poi `circuit_open` (4 fallimenti = soglia) | il retry **si ferma quando scatta il breaker** (fix: prima continuava a bussare) |
| 3ª chiamata | `attempts=0`, **71 ms**, nessuna chiamata a monte | short-circuit reale: il costo di un mercato in cooldown è ~0, non 3 secondi di timeout |
| stato su disco | `state.json` con `breakers`, `budget_hits`, `pacing` | il breaker sopravvive ai processi: senza questo, con 1 processo per chiamata, **non aprirebbe mai** |

Ultima nota da architetto: `fetch failed` dal sandbox **non è un difetto del tool**, è il vincolo d'ambiente.
Un candidato che degrada in modo deterministico (3 tentativi, backoff, stale, cooldown per Paese) invece di
esplodere o di ripetare all'infinito è esattamente il criterio con cui li abbiamo classificati: la resilienza,
non la lista di funzionalità, è ciò che rende un MCP Vinted utilizzabile per più di una settimana.

---

Config pronta all'uso e runbook: **`docs/vinted-mcp-runbook.md`** · config client: **`docs/vinted-mcp.example.json`** ·
env ops: **`docs/vinted-mcp.env.example`** · contratto dello shim: **`tools/vinted/README.md`**.
