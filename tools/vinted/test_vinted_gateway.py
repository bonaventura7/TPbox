#!/usr/bin/env python3
"""Test del gateway Vinted (solo stdlib, offline: nessuna chiamata di rete).

    python3 -m unittest discover -s tools/vinted -p 'test_*.py' -v

Coprono l'invariante architetturale che conta: a monte rotto il flusso deve
restituire dati vecchi marcati `degraded` (stale-while-error), aprire il
circuit breaker per Paese e restare dentro il budget di chiamate — mai far
fallire la conversazione dell'agente e mai martellare l'upstream.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import unittest
from io import StringIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vinted_gateway import (  # noqa: E402
    CACHE_KIND_TTL,
    _cache_payload,
    TOOL_SPECS,
    handle_mcp_request,
    serve_mcp,
    Backend,
    CircuitBreaker,
    Config,
    FileCache,
    Gateway,
    SlidingWindowCounter,
    TokenBucket,
    _cache_payload,
    _percentile,
    _prices,
    _price_stats,
    classify_error,
    main,
)


def make_cfg(**over) -> tuple[Config, tempfile.TemporaryDirectory]:
    tmp = tempfile.TemporaryDirectory(prefix="vinted-gw-")
    cfg = Config(
        backend=["npx", "-y", "@googlarz/vinted-client"],
        home=Path(tmp.name),
        ttl_scale=1.0,
        rate_per_sec=50.0,
        burst=50.0,
        global_per_min=1000.0,
        timeout_s=5.0,
        max_retries=2,
        breaker_failures=3,
        breaker_reset_s=60.0,
        max_items_per_call=100,
        no_upstream=False,
        stub=True,
        stub_fail=0,
        proxy_url=None,
        persist_state=False,
    )
    for k, v in over.items():
        setattr(cfg, k, v)
    return cfg, tmp


class TestResilienza(unittest.TestCase):
    def setUp(self):
        os.environ.pop("VINTED_GATEWAY_DISABLE", None)
        os.environ.pop("VINTED_GATEWAY_REVALIDATE", None)

    def _gw(self, **over):
        cfg, tmp = make_cfg(**over)
        self.addCleanup(tmp.cleanup)
        return Gateway(cfg)

    # -- 1. cache -------------------------------------------------------- #
    def test_seconda_chiamata_servita_da_cache(self):
        gw = self._gw()
        first = gw.execute("search", {"query": "levi 501", "country": "it", "limit": 6})
        second = gw.execute("search", {"query": "levi 501", "country": "it", "limit": 6})
        self.assertTrue(first["ok"])
        self.assertEqual(first["source"], "stub")
        self.assertEqual(second["source"], "cache")
        self.assertEqual(second["ttl_s"], round(CACHE_KIND_TTL["search"] * gw.cfg.ttl_scale, 1))
        self.assertEqual(first["data"], second["data"])

    def test_paesi_diversi_non_condividono_la_cache(self):
        gw = self._gw()
        a = gw.execute("search", {"query": "nike", "country": "it", "limit": 5})
        b = gw.execute("search", {"query": "nike", "country": "fr", "limit": 5})
        self.assertNotEqual(a["cache_key"], b["cache_key"])
        self.assertEqual(b["source"], "stub")

    def test_ttl_della_tassonomia_e_lungo(self):
        gw = self._gw()
        self.assertGreater(gw.cfg.ttl("categories"), gw.cfg.ttl("search"))

    # -- 2. stale-while-error ------------------------------------------- #
    def test_upstream_rotto_servita_versione_stale_degradata(self):
        gw = self._gw()
        ok = gw.execute("search", {"query": "air max", "country": "de", "limit": 4})
        self.assertTrue(ok["ok"])
        # invecchia artificialmente la voce di cache e rompe l'upstream
        path = gw.cache.path(ok["cache_key"])
        entry = json.loads(path.read_text())
        entry["stored_at"] = time.time() - 10_000
        path.write_text(json.dumps(entry))
        gw.cfg.stub_fail = 99
        gw.cfg.max_retries = 0
        res = gw.execute("search", {"query": "air max", "country": "de", "limit": 4})
        self.assertTrue(res["ok"], "deve servire stale, non fallire")
        self.assertTrue(res["degraded"])
        self.assertEqual(res["source"], "stale_cache")
        self.assertGreater(res["stale_age_s"], 1_000)
        self.assertEqual(res["reason"], "rate_limited")

    def test_nessuna_cache_e_upstream_rotto_ok_false(self):
        gw = self._gw(stub_fail=99, max_retries=0)
        res = gw.execute("search", {"query": "inesistente", "country": "it", "limit": 4})
        self.assertFalse(res["ok"])
        self.assertTrue(res["degraded"])
        self.assertEqual(res["source"], "none")
        self.assertEqual(res["data"], None)

    # -- 3. circuit breaker --------------------------------------------- #
    def test_breaker_si_apre_e_corta_il_traffico(self):
        """Il breaker deve tagliare fuori un mercato anche DOPO che l'upstream e' tornato
        sano: e' questo il punto, dare tempo a DataDome di smettere di punirci."""
        gw = self._gw(stub_fail=999, max_retries=0, breaker_failures=2, breaker_reset_s=600)
        for q in ("q1", "q2"):
            self.assertFalse(gw.execute("search", {"query": q, "country": "es", "limit": 3})["ok"])
        self.assertEqual(gw.breaker("es").state, "open")

        gw.cfg.stub_fail = 0  # upstream di nuovo sano
        blocked = gw.execute("search", {"query": "q3", "country": "es", "limit": 3})
        self.assertEqual(blocked["reason"], "breaker_open")
        self.assertFalse(blocked["ok"])
        self.assertEqual(blocked["breaker"]["state"], "open")
        self.assertGreater(blocked["breaker"]["seconds_until_probe"], 500)

        # blast radius confinato al mercato guasto: l'Italia non viene toccata
        healthy = gw.execute("search", {"query": "q4", "country": "it", "limit": 3})
        self.assertTrue(healthy["ok"])
        self.assertEqual(gw.breaker("it").state, "closed")

    def test_il_retry_si_ferma_quando_il_circuito_scatta(self):
        """Regressione: con max_retries alto, il loop NON deve continuare a bussare dopo
        che il breaker e' scattato sullo stesso errore."""
        gw = self._gw(stub_fail=999, max_retries=6, breaker_failures=1)
        res = gw.execute("search", {"query": "stop", "country": "gr", "limit": 3})
        self.assertFalse(res["ok"])
        self.assertEqual(res["reason"], "circuit_open")
        self.assertEqual(res["attempts"], 1, "un solo tentativo: la soglia e' 1 fallimento")
        self.assertEqual(res["breaker"]["state"], "open")

    def test_breaker_half_open_guarisce(self):
        br = CircuitBreaker(failure_threshold=2, reset_timeout=0.05)
        br.record_failure()
        br.record_failure()
        self.assertEqual(br.state, "open")
        self.assertFalse(br.allow())
        time.sleep(0.06)
        self.assertTrue(br.allow())
        self.assertEqual(br.state, "half_open")
        br.record_success()
        self.assertEqual(br.state, "closed")

    def test_errori_non_ritentabili_non_aprono_il_breaker_di_rete(self):
        e = classify_error("404 Not Found", 404)
        self.assertEqual(e["class"], "not_found")
        self.assertFalse(e["retryable"])
        b = classify_error("DataDome captcha challenge", 403)
        self.assertEqual(b["class"], "blocked")
        self.assertFalse(b["retryable"], "sul 403 da WAF il retry è dannoso: serve proxy nuovo")
        r = classify_error("HTTP 429 Too Many Requests", 429)
        self.assertTrue(r["retryable"])
        self.assertGreater(r["backoff_hint_s"], 1.0)

    # -- 4. budget anti-loop ------------------------------------------- #
    def test_budget_globale_blocca_il_loop_dell_agente(self):
        gw = self._gw(global_per_min=1.0, stub_fail=999, max_retries=0)
        first = gw.execute("search", {"query": "a", "country": "it", "limit": 3})
        second = gw.execute("search", {"query": "b", "country": "it", "limit": 3})
        self.assertIn(first["reason"], (None, "rate_limited"))
        self.assertEqual(second["reason"], "budget_exceeded")

    def test_sliding_window_counter(self):
        c = SlidingWindowCounter(3)
        self.assertTrue(all(c.try_add() for _ in range(3)))
        self.assertFalse(c.try_add())
        self.assertEqual(c.used, 3)

    # -- 5. kill switch -------------------------------------------------- #
    def test_kill_switch(self):
        gw = self._gw()
        os.environ["VINTED_GATEWAY_DISABLE"] = "1"
        res = gw.execute("search", {"query": "x", "country": "it", "limit": 3})
        self.assertFalse(res["ok"])
        self.assertEqual(res["reason"], "kill_switch")
        os.environ.pop("VINTED_GATEWAY_DISABLE")

    # -- 6. token bucket ------------------------------------------------- #
    def test_token_bucket_rispetta_il_refill(self):
        clock = {"t": 0.0}
        bucket = TokenBucket(rate_per_sec=1.0, capacity=2.0, clock=lambda: clock["t"])
        self.assertTrue(bucket.try_acquire())
        self.assertTrue(bucket.try_acquire())
        self.assertFalse(bucket.try_acquire(), "burst esaurito")
        clock["t"] += 1.0
        self.assertTrue(bucket.try_acquire(), "dopo 1s deve rientrare 1 token")

    def test_bucket_locale_saturo_non_consuma_tentativi_upstream(self):
        gw = self._gw(rate_per_sec=0.0001, burst=1.0, timeout_s=0.4)
        self.assertTrue(gw.bucket("nl").try_acquire())
        res = gw.execute("search", {"query": "y", "country": "nl", "limit": 3})
        self.assertIn(res["reason"], ("local_rate_limit", "stale", None))
        self.assertLessEqual(res["attempts"], gw.cfg.max_retries + 1)


class TestStatistica(unittest.TestCase):
    """La parte numerica del pricing deve essere verificabile a penna."""

    def test_percentili_e_mediana(self):
        vals = [10.0, 20.0, 30.0, 40.0, 50.0]
        self.assertEqual(_percentile(vals, 0.5), 30.0)
        self.assertEqual(_percentile(vals, 0.25), 20.0)
        self.assertEqual(_percentile([7.0], 0.5), 7.0)
        self.assertEqual(_percentile([], 0.5), 0.0)
        s = _price_stats(vals)
        self.assertEqual((s["n"], s["min"], s["median"], s["mean"], s["max"]), (5, 10.0, 30.0, 30.0, 50.0))
        self.assertEqual(s["confidence"], "medium")
        self.assertEqual(_price_stats(list(range(1, 11)))["confidence"], "high")
        self.assertEqual(_price_stats([5.0])["confidence"], "insufficient_data")

    def test_statistica_su_vectori_note(self):
        # verificata a mano: sum=380.5, n=6 -> mean 63.4167
        # mediana interpolata su idx 2.5 -> 62 + 0.5*(63.5-62) = 62.75
        # p25 su idx 1.25 -> 55 + 0.25*(62-55) = 56.75 ; p75 su 3.75 -> 63.5 + 0.75*(70-63.5) = 68.375
        # sigma (popolazione) = sqrt(921.2083/6) = 12.3909
        s = _price_stats([45, 55, 62, 63.5, 70, 85])
        self.assertEqual(s["n"], 6)
        self.assertEqual((s["min"], s["max"]), (45.0, 85.0))
        self.assertAlmostEqual(s["median"], 62.75, places=2)
        self.assertAlmostEqual(s["mean"], 63.42, places=2)
        self.assertAlmostEqual(s["p25"], 56.75, places=2)
        self.assertAlmostEqual(s["p75"], 68.38, places=2)
        self.assertAlmostEqual(s["quick_sale"], 56.75, places=2)
        self.assertAlmostEqual(s["stddev"], 12.39, places=2)

    def test_prezzi_in_cent_simo_convertiti(self):
        prices = _prices({"items": [{"price": {"amount": 5990}}, {"price": 20.0}, {"price": "x"}]})
        self.assertEqual(prices, [59.9, 20.0])

    def test_fanout_fail_soft_con_statistica(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        res = gw.compare({"query": "north face jacket", "countries": ["it", "de", "fr"], "limit": 8})
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["rows"]), 3)
        for row in res["rows"]:
            self.assertEqual(row["sample"], 8)
            self.assertIsNotNone(row["median"])
        meds = [r["median"] for r in res["rows"]]
        self.assertAlmostEqual(res["spread_pct"], round((max(meds) - min(meds)) / min(meds) * 100, 1), places=1)
        self.assertEqual(res["countries_ok"], [r["country"] for r in res["rows"]])

    def test_breaker_persistente_sopravvive_al_processo(self):
        """Regressione architetturale: con un processo per chiamata, il breaker DEVE
        sopravvivere, altrimenti non apre mai e l'agente resta senza protezione."""
        cfg, tmp = make_cfg(stub_fail=999, max_retries=0, breaker_failures=2, persist_state=True)
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        for q in ("p1", "p2"):
            self.assertFalse(gw.execute("search", {"query": q, "country": "pt", "limit": 2})["ok"])
        gw.cfg.stub_fail = 0
        self.assertEqual(gw.breaker("pt").state, "open")
        self.assertEqual(gw.execute("search", {"query": "p3", "country": "pt", "limit": 2})["reason"], "breaker_open")
        # un secondo "processo" sulla stessa home eredita la decisione
        gw2 = Gateway(cfg)
        self.assertEqual(gw2.breaker("pt").state, "open")
        self.assertFalse(gw2.execute("search", {"query": "p4", "country": "pt", "limit": 2})["ok"])

    def test_budget_persistente_condiviso_tra_invocazioni(self):
        cfg, tmp = make_cfg(stub_fail=999, max_retries=0, global_per_min=2.0, persist_state=True)
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        gw.execute("search", {"query": "b1", "country": "it", "limit": 2})
        gw2 = Gateway(cfg)  # nuovo processo, stesso stato
        self.assertEqual(gw2.budget.used, 1)
        gw2.execute("search", {"query": "b2", "country": "be", "limit": 2})
        blocked = Gateway(cfg).execute("search", {"query": "b3", "country": "ch", "limit": 2})
        self.assertEqual(blocked["reason"], "budget_exceeded")

    def test_pacing_persistente_limita_due_processi(self):
        """Due invocazioni separate devono rispettare il pacing: il secondo slot non e'
        disponibile subito e, se la coda supera il max wait, si degrada senza upstream."""
        cfg, tmp = make_cfg(persist_state=True, rate_per_sec=2.0, pacing_max_wait_s=0.0)
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        gw.execute("search", {"query": "g1", "country": "dk", "limit": 2})
        res = gw.execute("search", {"query": "g2", "country": "dk", "limit": 2})
        self.assertEqual(res["reason"], "local_rate_limit")
        self.assertIn("DK", res["upstream_error"]["guidance"].upper())
        # un altro mercato non e' in coda
        self.assertTrue(gw.execute("search", {"query": "g3", "country": "se", "limit": 2})["ok"])

    def test_paese_non_supportato(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        with self.assertRaises(ValueError):
            gw.compare({"query": "x", "countries": ["jp"], "limit": 4})


class TestCliEContratto(unittest.TestCase):
    def _run(self, argv):
        out = StringIO()
        old = sys.stdout
        sys.stdout = out
        try:
            code = main(argv)
        finally:
            sys.stdout = old
        return code, json.loads(out.getvalue())

    def test_explain_non_tocca_upstream(self):
        os.environ["VINTED_GATEWAY_STUB"] = "1"
        cfg_dir = tempfile.TemporaryDirectory(prefix="vinted-cli-")
        self.addCleanup(cfg_dir.cleanup)
        os.environ["VINTED_GATEWAY_HOME"] = cfg_dir.name
        code, plan = self._run(["--explain", "search", "--query", "levis 501", "--country", "de",
                                "--price-max", "60"])
        self.assertEqual(code, 0)
        self.assertTrue(plan["dry_run"])
        # la forma del README (npx -y <pkg> search) NON funziona: il pacchetto ha 2 bin.
        self.assertEqual(plan["upstream_argv"][:6],
                         ["npx", "-y", "-p", "@googlarz/vinted-client@1.1.4", "vinted", "search"])
        self.assertIn("--price-max", plan["upstream_argv"])
        self.assertIn("--country", plan["upstream_argv"])
        self.assertEqual(len(plan["cache_key"]), 32)
        self.assertEqual(plan["ttl_s"], float(CACHE_KIND_TTL["search"]))

    def test_cache_payload_esclude_chiavi_vuote(self):
        p = _cache_payload("search", {"query": "a", "country": "it", "brand": "", "limit": None})
        self.assertEqual(p, {"query": "a", "country": "it"})

    def test_paginazione_del_limit(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        b = Backend(cfg)
        argv = b.argv_for("search", {"query": "x", "country": "it", "limit": 60})
        self.assertEqual(argv[-2:], ["--limit", "60"])
        self.assertNotIn("--all", argv)
        # limit > 100 => paginazione completa, ma il gateway FA IL TRIM a max_items_per_call
        # (qui 100 nel cfg di test): proteggere il contesto dell'LLM e' parte del controllo.
        argv = b.argv_for("search", {"query": "x", "country": "it", "limit": 300})
        self.assertEqual(argv[-3:], ["--all", "--max-items", "100"])
        argv = b.argv_for("search", {"query": "x", "country": "it", "limit": 10, "brand": "Nike",
                                    "brand_ids": "12,13", "category_id": 5, "page": 2})
        for flag in ("--brand", "Nike", "--brand-ids", "12,13", "--category-id", "5", "--page", "2"):
            self.assertIn(flag, argv)

    def test_escalation_su_item_bloccato_da_datadome(self):
        """Il 403 su un item non e' un guasto del backend: prima si prova il fallback
        stealth del CLI (una sola volta, senza sporcare il breaker), poi ci si arrende."""
        cfg, tmp = make_cfg(stub_fail=1, stub_fail_class="blocked", max_retries=0,
                            escalate_browser=True, rate_per_sec=100.0)
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        res = gw.execute("item", {"id": 1234, "country": "it"})
        self.assertTrue(res["ok"])
        self.assertEqual(res["attempts"], 2)
        self.assertEqual(res["data"]["fetched_via"], "browser")
        self.assertEqual(res["breaker"]["failures"], 0, "l'escalation non deve contare come fallimento")
        self.assertNotIn("browser", json.loads(json.dumps(_cache_payload("item", {"id": 1234, "country": "it",
                                                                                   "browser": True}))))

    def test_senza_escalation_il_blocco_e_definitivo(self):
        cfg, tmp = make_cfg(stub_fail=1, stub_fail_class="blocked", max_retries=0,
                            escalate_browser=False, rate_per_sec=100.0)
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        res = gw.execute("item", {"id": 99, "country": "it"})
        self.assertFalse(res["ok"])
        self.assertEqual(res["reason"], "blocked")
        self.assertEqual(res["breaker"]["failures"], 1)

    def test_flag_reali_del_cli(self):
        """Allineamento verificato contro `vinted <cmd> --help`, non contro il README."""
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        b = Backend(cfg)

        def tail(kind, a):
            """Ignora il prefisso del backend (che e' configurabile e gia' testato altrove)."""
            return b.argv_for(kind, a)[len(cfg.backend):]

        self.assertEqual(tail("item", {"id": 1234, "country": "de"}), ["item", "1234", "--country", "de"])
        self.assertEqual(tail("item", {"id": 1234, "country": "de", "browser": True})[-1], "--browser")
        self.assertNotIn("--country", tail("item", {"id": "https://www.vinted.it/items/1234", "country": "it"}),
                         "con un URL il paese e' gia' nell'URL")
        self.assertEqual(tail("seller", {"id": 7, "country": "it"}), ["seller", "7", "--country", "it"])
        si = tail("seller_items", {"id": 7, "country": "it", "limit": 400, "page": 2})
        self.assertEqual(si, ["seller-items", "7", "--country", "it", "--output", "json", "--limit", "100",
                              "--page", "2"], "a monte il range e' 1..100: il gateway clampa, non gira valori fuori scala")
        self.assertEqual(tail("trending", {"country": "es", "category_id": 12, "limit": 30}),
                         ["trending", "--country", "es", "--output", "json", "--category-id", "12", "--limit", "30"])
        self.assertEqual(tail("brands", {"query": "nike", "country": "fr", "limit": 3}),
                         ["brands", "nike", "--country", "fr", "--limit", "3"])
        self.assertEqual(tail("categories", {"country": "it", "query": "shoes"}),
                         ["categories", "--country", "it", "--output", "json", "--query", "shoes"])

    def test_raw_passthrough_whitelist_e_deny(self):
        from vinted_gateway import check_raw, derive_country
        self.assertEqual(check_raw(["categories", "--country", "it", "--query", "shoes"]), [])
        # default del CLI a monte = fr: il gateway deve keyare breaker/pacing su fr, non su it
        self.assertEqual(derive_country(["search", "nike"]), "fr")
        self.assertEqual(derive_country(["search", "nike", "--country", "de"]), "de")
        self.assertEqual(derive_country(["search", "nike", "-c", "es"]), "es")
        self.assertEqual(derive_country(["brands", "nike"]), "__global__")
        for bad in (["debug"], ["publish_listing", "12"], ["search", "x", "--watch", "5"],
                    ["search", "x", "--max-pages", "500"], ["search", "x", "--max-items=99999"],
                    ["search", "x", "--max-pages", "abc"]):
            self.assertTrue(check_raw(bad), f"avrebbe dovuto essere rifiutato: {bad}")
        self.assertTrue(any("cookie" in x for x in check_raw(["debug"])), "serve un perche' leggibile")
        self.assertTrue(any("tetto" in x for x in check_raw(["search", "x", "--max-pages", "500"])))
        # un sottocomando read-only con flag innocui deve passare: il gateway non e' un linter
        self.assertEqual(check_raw(["seller-items", "--help"]), [])
        self.assertEqual(check_raw(["search", "nike", "--max-pages", "5", "--output", "table"]), [])

    def test_raw_gira_attorno_alle_difese_del_gateway(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        res = gw.execute("raw", {"argv": ["categories", "--country", "it", "--query", "calzature"],
                                "country": "it"})
        self.assertTrue(res["ok"])
        again = gw.execute("raw", {"argv": ["categories", "--country", "it", "--query", "calzature"],
                                   "country": "it"})
        self.assertEqual(again["source"], "cache")
        other = gw.execute("raw", {"argv": ["categories", "--country", "de", "--query", "calzature"],
                                   "country": "de"})
        self.assertEqual(other["source"], "stub", "argomenti diversi => cache diversa")
        self.assertEqual(gw.cfg.ttl("raw"), 900.0)

    def test_backend_argv_per_comando(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        b = Backend(cfg)
        self.assertEqual(b.argv_for("item", {"id": 123})[-2:], ["item", "123"])
        self.assertEqual(b.argv_for("seller_items", {"id": 9})[-4:], ["seller-items", "9", "--output", "json"])
        self.assertEqual(b.argv_for("trending", {"country": "es"})[-5:], ["trending", "--country", "es", "--output", "json"])
        with self.assertRaises(ValueError):
            b.argv_for("publish_listing", {})

    def test_mcp_handshake_e_tools(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        init = handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                       "params": {"protocolVersion": "2025-06-18"}})
        self.assertEqual(init["result"]["protocolVersion"], "2025-06-18")
        self.assertIn("tools", init["result"]["capabilities"])
        self.assertIn("degraded", init["result"]["instructions"])

        listed = handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]
        self.assertEqual(len(listed), len(TOOL_SPECS))
        for t in listed:
            self.assertTrue(t["annotations"]["readOnlyHint"] and not t["annotations"]["destructiveHint"])
            self.assertFalse(t["inputSchema"].get("additionalProperties", True))
            self.assertIn("gateway", t["description"].lower())
        self.assertNotIn("publish", json.dumps(listed).lower())
        self.assertNotIn("delete_listing", json.dumps(listed).lower())
        self.assertIn("vinted_raw", [t["name"] for t in listed])

    def test_mcp_call_e_errori_di_protocollo(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        call = handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                                       "params": {"name": "vinted_search",
                                                  "arguments": {"query": "levis", "country": "it", "limit": 3},
                                                  "_meta": {"correlation_id": "t-1"}}})["result"]
        self.assertFalse(call["isError"])
        env = call["structuredContent"]
        self.assertEqual(env["correlation_id"], "t-1")
        self.assertEqual(len(env["data"]["items"]), 3)

        cmp_ = handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
                                       "params": {"name": "vinted_compare",
                                                  "arguments": {"query": "levis", "countries": ["it", "de"],
                                                                "limit": 5}}})["result"]
        self.assertEqual(len(cmp_["structuredContent"]["rows"]), 2)
        self.assertFalse(cmp_["isError"])

        self.assertEqual(handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
                                                  "params": {"name": "vinted_pubblica"}})["error"]["code"], -32602)
        self.assertEqual(handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 6, "method": "foo/bar"})["error"]["code"], -32601)
        self.assertIsNone(handle_mcp_request(gw, {"jsonrpc": "2.0", "method": "notifications/initialized"}))
        # argomento mancante / valore fuori enum / chiave sconosciuta -> -32602, non traceback
        for bad_args in ({}, {"id": 5, "paese": "it"}, {"id": 5, "country": "jp"}):
            resp = handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 7, "method": "tools/call",
                                           "params": {"name": "vinted_item", "arguments": bad_args}})
            self.assertEqual(resp["error"]["code"], -32602)
            self.assertTrue(resp["error"]["message"])
        big = handle_mcp_request(gw, {"jsonrpc": "2.0", "id": 8, "method": "tools/call",
                                      "params": {"name": "vinted_search",
                                                 "arguments": {"query": "x", "limit": 5000}}})
        self.assertIn("fuori dall'intervallo", big["error"]["message"])

    def test_mcp_stdio_loop(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        stdin = StringIO("\n".join([json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
                                     "{ non-sono-json",
                                     json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})]) + "\n")
        stdout = StringIO()
        self.assertEqual(serve_mcp(gw, stdin=stdin, stdout=stdout), 0)
        lines = [json.loads(l) for l in stdout.getvalue().splitlines() if l.strip()]
        self.assertEqual(lines[0]["result"], {})
        self.assertEqual(lines[1]["error"]["code"], -32700)
        self.assertEqual(len(lines[2]["result"]["tools"]), len(TOOL_SPECS))

    def test_stats_e_prune(self):
        cfg, tmp = make_cfg()
        self.addCleanup(tmp.cleanup)
        gw = Gateway(cfg)
        gw.execute("search", {"query": "z", "country": "it", "limit": 3})
        st = gw.stats()
        self.assertEqual(st["cache_entries"], 1)
        self.assertTrue(st["stub"])
        self.assertEqual(gw.cache.prune()[0], 1)

    def test_file_cache_key_stabile(self):
        a = FileCache.key("search", {"query": "x", "country": "it"})
        b = FileCache.key("search", {"country": "it", "query": "x"})
        self.assertEqual(a, b, "la cache key deve essere indipendente dall'ordine delle chiavi")



if __name__ == "__main__":
    unittest.main(verbosity=2)
