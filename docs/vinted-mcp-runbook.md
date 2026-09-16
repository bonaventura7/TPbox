# Runbook · Vinted MCP (Tier A locale + Tier B managed)

Compagno di `docs/vinted-mcp-selection.md`. Tutto verificato su Linux/Node 22/Python 3.11 il 2026-09-16.

---

## 1. Installazione — Tier A (default giornaliero)

```bash
# 1. client + MCP server (MIT, npm). In produzione: versione ESATTA, mai @latest.
npm install -g @googlarz/vinted-client@1.1.4
vinted --help

# 2. se serve il codice dell'ultima release GitHub (npm 1.1.4 lagga la tag v1.1.5:
#    il job `publish` della loro CI era in failure → workaround documentato)
npm install -g github:googlarz/vinted-mcp-cli#v1.1.5

# 3. registro l'MCP nell'agente (stdio). ATTENZIONE: la forma del README
#    `npx -y @googlarz/vinted-client/mcp` NON funziona (il pacchetto espone DUE bin):
#    npx risponde "could not determine executable to run" e la forma /mcp non emette nulla.
claude mcp add vinted -- npx -y -p @googlarz/vinted-client@1.1.4 vinted-mcp
npx -y -p @googlarz/vinted-client@1.1.4 vinted search "levis 501" --country it   # idem per la CLI
```

Due insidie verificate il 2026-09-16, da tenere a mente in reparto:

1. `initialize` senza `clientInfo.version` → `-32603` (validazione Zod strict del server; alcuni client
   omettono il campo: se l'MCP "non parte", provare prima di tutto lì);
2. i 12 tool del server upstream **non espongono `annotations`**: il client non può sapere che sono
   read-only e idempotenti. Lo shim del §3 le dichiara (e aggiunge la validazione degli argomenti).

Se il progetto ha già `bun`/`npm` in dev (come questo repo), la via più corta è il config file: vedi
`docs/vinted-mcp.example.json` (blocco pronto da incollare in `claude_desktop_config.json`, `cursor/mcp.json`
o `.mcp.json`).

### Smoke test (deve funzionare da un'IP residenziale)

```bash
vinted search "levis 501" --country it --price-max 80 --condition very_good,good --output table
vinted item   1234567
vinted compare "north face nuptse" --countries it,fr,de --output table
```

## 2. Installazione — Tier B (managed, zero manutenzione)

```bash
# MCP remoto via HTTP: niente browser, niente Chromium, proxy e DataDome sono del vendor
# config: { "type": "http", "url": "https://mcp.apify.com/?tools=fetch-actor-details,lowlanddata/vinted-scraper" }
export APIFY_TOKEN="apify_api_…"        # solo nel secret manager, mai in git
```

Nota di progettazione: l'Actor **non restituisce dati dei venditori** → è anche la scelta più pulita lato GDPR.
Prezzo ~1,50–2,40 $/1 000 risultati; il free tier (5 $/mese) copre l'esplorazione.

## 3. Shim di resilienza (consigliato davanti a entrambi)

```bash
# il default e' gia' corretto (npx -y -p @googlarz/vinted-client@1.1.4 vinted);
# sovrascriverlo solo per pin diversi o per un backend alternativo
export VINTED_GATEWAY_CMD='npx -y -p @googlarz/vinted-client@1.1.4 vinted'
python3 tools/vinted/vinted_gateway.py --pretty search --query "levis 501" --country it --price-max 80 --limit 12
python3 tools/vinted/vinted_gateway.py --pretty compare --query "air jordan 1" --countries it,fr,de,uk --limit 48
python3 tools/vinted/vinted_gateway.py stats        # breaker, pacing, budget, cache
python3 tools/vinted/vinted_gateway.py prune        # igiene cache (cron notturno)
python3 tools/vinted/vinted_gateway.py --explain search --query x --country de   # piano senza effetti
python3 tools/vinted/vinted_gateway.py raw --argv "categories --country it --query scarpe"
```

**`raw` è la valvola di estensibilità**: passa qualunque sottocomando *read-only* del CLI con qualunque flag,
quindi quando l'upstream aggiunge un'opzione non serve toccare questo codice. Non è un buco: la whitelist è di
8 sottocomandi, `debug` è escluso perché stampa i cookie di sessione (un segreto nel contesto del modello), ogni
verbo di scrittura è rifiutato e `--max-pages`/`--max-items` sono limitati per non aggirare il budget.

### Lo shim è a sua volta un server MCP (stdio, 9 tool)

```bash
python3 tools/vinted/vinted_gateway.py mcp     # JSON-RPC 2.0 newline-delimited
```

`vinted_search`, `vinted_item`, `vinted_seller`, `vinted_seller_items`, `vinted_compare`, `vinted_trending`,
`vinted_brands`, `vinted_categories`, `vinted_raw`, `vinted_gateway_stats` (10 tool). Tutti con `readOnlyHint: true`,
`destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`, `additionalProperties: false` e
validazione degli argomenti alla frontiera (argomento mancante o fuori range → `-32602` con messaggio,
non traceback). Nessun tool di scrittura **esiste**: il vincolo sta nella superficie esposta, non nel prompt,
così un modello che sbanda non può pubblicare né cancellare nulla.

Contratto di output (lo legge l'agente, quindi è parte dell'API):

```jsonc
{ "ok": true, "degraded": true, "source": "stale_cache", "stale_age_s": 3812.4,
  "reason": "rate_limited", "upstream_error": { "class": "rate_limited", "retryable": true,
      "backoff_hint_s": 30, "guidance": "429: rispetta Retry-After, abbassa RATE_PER_SEC, allarga il TTL" },
  "attempts": 3, "latency_ms": 412, "cache_key": "3cb7…9125", "ttl_s": 600,
  "correlation_id": "vt-1a0ab…-1703", "breaker": { "state": "closed", "failures": 0, "seconds_until_probe": 0 } }
```

`compare` invece: `cheapest`, `spread_pct`, `rows[]` (`n`, `min`, `p25`, `median`, `mean`, `p75`, `max`,
`stddev`, `quick_sale`, `confidence`), `errors[]`, `partial`, `degraded`, `guidance`.
Le statistiche le calcola lo shim, **non il modello**: è l'unico modo di avere numeri riproducibili e testati.

### Variabili d'ambiente

| Variabile | Default | Quando toccarla |
|---|---|---|
| `VINTED_GATEWAY_CMD` | `npx -y @googlarz/vinted-client` | pin di versione / backend alternativo |
| `VINTED_GATEWAY_HOME` | `~/.cache/vinted-gateway` | cache + `state.json` + audit (volume persistente in container) |
| `VINTED_GATEWAY_RATE_PER_SEC` | `0.5` | **su IP datacenter: 0.1–0.2**; dietro proxy residenziale: 1–3 |
| `VINTED_GATEWAY_BURST` | `2` | raffiche di fan-out multi-Paese |
| `VINTED_GATEWAY_PACING_MAX_WAIT_S` | `6` | 0 = fail-fast (preferito nei cron, così il job non si impalla) |
| `VINTED_GATEWAY_MAX_CALLS_PER_MIN` | `60` | tetto anti-loop dell'agente |
| `VINTED_GATEWAY_MAX_ITEMS` | `200` | trim per risposta (budget token) |
| `VINTED_GATEWAY_TIMEOUT_S` | `25` | sotto i 10 s su reti mobili genera falsi `transient` |
| `VINTED_GATEWAY_MAX_RETRIES` | `2` | 0 nei cron che non devono sovrapporsi |
| `VINTED_GATEWAY_BREAKER_FAILURES` / `_RESET_S` | `4` / `90` | più conservativo su IP "preziosi" |
| `VINTED_GATEWAY_TTL_<KIND>` | per tipo (§ADR) | TTL esplicito per `search`, `item`, `brands`… |
| `VINTED_GATEWAY_TTL_SCALE` | `1` | 0.2 = ambiente promiscuo, 5 = campagna di ricerca |
| `VINTED_GATEWAY_OFFLINE` | – | `1` = non chiamare l'upstream (demo/CI) |
| `VINTED_GATEWAY_STUB` / `_STUB_FAIL` | – | `1` = dati sintetici deterministici; `STUB_FAIL=k` = i primi k tentativi falliscono (fault injection) |
| `VINTED_GATEWAY_REVALIDATE` | `1` | `0` = servi stale senza andare a monte (risparmio estremo / IP in osservazione) |
| `VINTED_GATEWAY_DISABLE` | – | **kill switch**: spegne il flusso senza redeploy |
| `VINTED_GATEWAY_PERSIST` | `1` | 0 = solo test (breaker/budget/pacing in memoria) |
| `VINTED_GATEWAY_ESCALATE_BROWSER` | `1` | 0 = mai usare `--browser` (Chromium non installato / server senza GUI) |
| `VINTED_PROXY_URL` | – | `http://user:pass@residenziale:port` — il vero collo di bottiglia |

Uscite: `0` ok (anche degradato/stale), `2` errore d'uso, `4` non disponibile (breaker aperto, kill switch,
budget esaurito), `5` errore upstream non recuperato. I codici `4` e `5` sono gli unici su cui allarmare.

## 4. Matrice di degradazione (comportamento atteso, non errore)

| Sintomo a monte | Cosa fa lo shim | Cosa deve dire l'agente all'utente |
|---|---|---|
| `403` su un **item** | **1 escalation con `--browser`** (fallback stealth del CLI) e solo se fallisce anche quella: `blocked`, breaker +1, degrada a stale | "dati non verificabili ora (protezione anti-bot); ultima rilevazione alle T" |
| `403` su altre chiamate | **nessun retry** (riprovare su un challenge allunga il ban), breaker +1, degrada a stale se c'è | come sopra |
| `429` | retry con backoff (hint 30 s) + jitter, poi stale | "mercato saturo, ri-provo tra ~30 s" |
| `401` | `session_expired`: 1 retry, poi ri-bootstrap (login) | "sessione da rinnovare: `vinted login --country it`" (solo Tier con auth) |
| `5xx`/timeout | `transient`: max 2 retry, poi stale | "servizio degradato" |
| `404` | risposta definitiva, breaker intatto | "annuncio non più disponibile" |
| breaker aperto | corta lì, a costo zero, con `seconds_until_probe` | "paese X in cooldown 90 s, uso Y" |
| budget esaurito | `budget_exceeded` + stale | "ragione troppo costosa: accorpo le query" |
| `VINTED_GATEWAY_DISABLE=1` | `kill_switch`, zero chiamate | "integrazione Vinted momentaneamente disattivata" |

Regola d'oro per il prompt dell'agente: *mai* presentare un dato `degraded` come corrente; riportare sempre
`source`, `stale_age_s` e `correlation_id` quando l'utente segnala un problema.

## 5. Esercitazione e manutenzione

```bash
# test unitari (offline, 36 casi, ~5 s)
python3 -m unittest discover -s tools/vinted -p 'test_*.py' -v

# fault injection: i primi 2 tentativi falliscono → verifica retry + stale + breaker
VINTED_GATEWAY_STUB=1 VINTED_GATEWAY_STUB_FAIL=99 VINTED_GATEWAY_MAX_RETRIES=0 \
VINTED_GATEWAY_BREAKER_FAILURES=2 python3 tools/vinted/vinted_gateway.py search --query x --country it
```

**Alert (soglie che hanno senso qui, non vanity metric):**
- `% 403` su finestra 10 min > 5% → proxy/IP in osservazione: ridurre `RATE_PER_SEC`, ruotare uscita.
- breaker in `open` > 15 min su ≥2 Paesi → incidente, non rumore: passare al Tier B (`mcp.apify.com`).
- `budget_used/limit` > 0.8 sostenuto → l'agente sta facendo loop: controllare i `correlation_id` ricorrenti.
- età media delle risposte `stale_cache` > 6 h → il flusso è silenziosamente fuori servizio.

**Cron:** `prune` notturno; un job "verifica contratto" (1 `search` per Paese su una query nota) che fallisce
appena Vinted cambia forma agli endpoint — è il canarino che compra le 4 ore di debug successive al niente.

**Rollback:** `VINTED_GATEWAY_DISABLE=1` (istantaneo) → se il flusso è critico, switch del backend a Tier B
(cambio di 1 chiave di config, nessuna modifica al codice dell'agente). Lo shim è il punto di rollback: questo
è il vero motivo per cui esiste.

## 6. Cose che ho verificato e che non tornano (non fidatevi del listing)

1. **Glama "Updated a month ago" ≠ vivo.** `andrijdavid/vinted-mcp`: npm `0.1.2` (aprile), README che dice
   `bunx …@next` (tag `0.1.0-next.20260315203252`, cioè **più vecchio** di latest). Versionamento incoerente.
2. **`rachid598/mcpvin` → 404** oggi, nonostante Glama lo mostri con quality A / maintenance B. Un listing
   può essere verde e il sorgente inesistente: **la due diligence è "il repo clona e builda?", non la badge**.
3. **`@googlarz/vinted-client` publish CI in `failure`** sull'ultimo commit di main, con release GitHub `v1.1.5`
   pubblicata ma npm ferma a `1.1.4`: se ti serve una fix recente, installa dal tag, non aspettare npm.
4. **`Rbillon59/vinted-mcp-server`**: Glama dichiara MIT, il repo non ha LICENSE file → in un audit questo è
   "all rights reserved", non "MIT". Controllare sempre il file, non il badge.

## 7. Esito della verifica empirica (IP datacenter, senza proxy)

```text
run 1  → attempts=3  reason=transient   (error: fetch failed)      3.57 s   rc=5   breaker closed, failures=3
run 2  → attempts=1  reason=circuit_open (soglia 4 raggiunta)     1.88 s   rc=5   breaker open
run 3  → attempts=0  reason=breaker_open                           0.07 s   rc=4   nessuna chiamata a monte
```

L'unica riga che conta per chi fa on-call: **il terzo tentativo non costa nulla**. Se un mercato è in
cooldown, l'agente riceve comunque una risposta strutturata (`ok:false`, `reason`, `guidance`) invece di
stare a aspettare 3 timeout e poi inventarsi un prezzo. È questo il comportamento che giustifica l'esistenza
dello shim davanti a un MCP di terze parti.

