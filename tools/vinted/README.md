# `tools/vinted` — gateway di resilienza per i flussi MCP su Vinted

Perché esiste: Vinted non ha un'API pubblica, quindi qualunque MCP (incluso il migliore oggi disponibile,
`googlarz/vinted-mcp-cli`) parla con l'API interna `/api/v2/...` e può fallire in tre modi **diversi**
(`403` DataDome, `429` rate limit, `401` sessione). Un MCP collegato a un agente senza questi controlli è un
single point of failure che l'agente stesso alimenta con i suoi loop.

Decisione completa, punteggi e due diligence: **[`docs/vinted-mcp-selection.md`](../../docs/vinted-mcp-selection.md)** ·
esercizio operativo: **[`docs/vinted-mcp-runbook.md`](../../docs/vinted-mcp-runbook.md)**.

```bash
python3 tools/vinted/vinted_gateway.py mcp     # server MCP su stdio (10 tool, tutti read-only)
python3 tools/vinted/vinted_gateway.py --help  # equivalente CLI, stesse identiche difese
```

## Cosa aggiunge sopra il client

| # | Controllo | Nota che conta |
|---|---|---|
| 1 | token bucket per Paese | in-process: raffiche e fan-out |
| 2 | **pacing cross-process** | `state.json` + `flock`: 1 processo per chiamata ⇒ senza questo il rate limiting è decorativo |
| 3 | cache file con TTL per tipo dato | `brands`/`categories` 24 h, `search` 10 min; chiave = `sha256(payload)` indipendente dall'ordine dei campi |
| 4 | **circuit breaker per Paese, persistente** | 4 fallimenti → open 90 s → 1 probe half-open; il cooldown di `it` non spegne `de` |
| 5 | retry + backoff esponenziale + jitter | **solo** su `rate_limited`/`transient`/`session_expired`; `blocked` e `not_found` non si ritentano |
| 6 | **retry interrotto quando il breaker scatta** | se l'errore N raggiunge la soglia, il loop si ferma: continuare a bussare è ciò che trasforma un 429 in un ban da 24 h |
| 7 | stale-while-error | a monte rotto ⇒ `ok:true, degraded:true, source:"stale_cache", stale_age_s:N` invece di far fallire la conversazione |
| 8 | budget anti-loop | tetto di chiamate/min a livello di host, persistito: è il freno al "provo ancora un attimo" del modello |
| 9 | **escalation `--browser` sugli item bloccati** | su `403` di DataDome riprova **una** volta col fallback stealth del CLI, *senza* contare il fallimento nel breaker |
| 10 | trim degli item per risposta | `VINTED_GATEWAY_MAX_ITEMS`: il contesto dell'LLM è denaro e le allucinazioni sui prezzi crescono con esso |
| 11 | `raw` pass-through **con whitelist** | i flag nuovi dell'upstream non richiedono di forkare nulla; ma `debug` (stampa i cookie di sessione) e ogni verbo di scrittura sono rifiutati **prima** di toccare la rete, e `--max-pages`/`--max-items` sono capsati per non aggirare il budget |
| 12 | audit NDJSON + `correlation_id` | una riga per evento: `cache_hit`, `upstream_retry`, `breaker_tripped_mid_call`, `escalate_browser`, `budget_exceeded` |
| 13 | `VINTED_GATEWAY_DISABLE=1` | kill switch senza redeploy: è il rollback, non il revert |

## Contratto di output

```jsonc
{ "ok": true, "degraded": true, "source": "stale_cache", "stale_age_s": 3812.4,
  "reason": "rate_limited", "attempts": 3, "latency_ms": 412,
  "cache_key": "3458ad89…", "ttl_s": 600.0, "correlation_id": "vt-1a0ab…-bc3b",
  "upstream_error": { "class": "rate_limited", "retryable": true, "backoff_hint_s": 30, "guidance": "…" },
  "data": … , "breaker": { "state": "closed", "failures": 0, "seconds_until_probe": 0.0 } }
```

Codici d'uscita: `0` ok (anche degradato/stale) · `2` errore d'uso o `raw` rifiutato · `4` non disponibile
(breaker aperto, kill switch, budget) · `5` errore upstream non recuperato. **Solo `4` e `5` meritano un allarme.**

## Copertura rispetto ai 12 tool MCP del client a monte

| Tool upstream | Qui | Come |
|---|---|---|
| `search_items` | ✅ `vinted_search` | filtri prezzo/brand/categoria/taglia/condizione/ordinamento/data |
| `get_item` | ✅ `vinted_item` | + escalation automatica `--browser` su 403 |
| `get_seller` / `get_seller_items` | ✅ | paese propagato (verificato su `--help`) |
| `compare_prices` | ✅ `vinted_compare` | **fan-out fatto qui**, non a monte: ogni Paese ha cache, breaker e fallimento isolato; in più mediana/p25/p75/stddev/confidenza calcolati da funzioni testate |
| `search_all_items` | ✅ via `limit > 100` | mappato su `--all --max-items` (il CLI limita `--limit` a 1..100) |
| `search_brands` / `get_categories` / `get_trending` | ✅ | TTL lungo per la tassonomia |
| `get_colors`, `get_size_groups` | ⚠️ no | **non hanno sottocomando CLI**: servono il trasporto MCP diretto del client. Le taglie si recuperano con `--size-ids`/`vinted search`; i colori no |
| `get_seller_feedback` | ⚠️ no | come sopra (e il suo `delete_draft`/`publish` **non** sono esposti per policy: vedi ADR §4.3) |

Il gap è accettato deliberatamente: il gateway deve restare un involucro deterministico senza browser. Se i
colori diventassero necessari, il costo è una chiave di config verso il Tier B gestito, non una riscrittura.

## Auto-verifica

```bash
python3 -m unittest discover -s tools/vinted -p 'test_*.py'      # 36 test, offline, ~5 s

# demo senza rete (dati sintetici deterministici + fault injection)
VINTED_GATEWAY_STUB=1 VINTED_GATEWAY_STUB_FAIL=99 VINTED_GATEWAY_BREAKER_FAILURES=2 \
VINTED_GATEWAY_MAX_RETRIES=0 python3 tools/vinted/vinted_gateway.py search --query x --country it

# cosa manderebbe a monte, senza mandarlo
python3 tools/vinted/vinted_gateway.py --explain search --query "levis 501" --country de --price-max 60
```

I test non sono ornamentali: `26 → 36` casi hanno già pagato due fix reali (breaker che non sopravviveva ai processi,
retry che continuava dopo l'apertura del circuito) e un allineamento ai flag veri del CLI (`--limit` 1..100,
`--max-items` solo con `--all`, `item --browser`), scoperto eseguendo `vinted <cmd> --help` invece di fidarmi del README.
