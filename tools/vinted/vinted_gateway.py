#!/usr/bin/env python3
"""Vinted Gateway — shim di resilienza attorno a un client Vinted (CLI/MCP).

Motivazione (Senior Solutions Architect, flusso HA su API non ufficiali)
------------------------------------------------------------------------
Vinted non espone un API pubblica: gli MCP server disponibili parlano con l'API
JSON interna `/api/v2/...` proteggendo la sessione con cookie e subendo
DataDome (403/captcha, 429, 401 a token scaduto). Un MCP "nudo" collegato a un
agente è quindi un single point of failure: l'agente, in loop di retry, può
bruciare l'IP o l'account in pochi minuti.

Questo shim implementa lato-architetto ciò che il provider non può garantirci:

  1. token bucket per Paese (il rate limit è per-mercato, non globale);
  2. cache LRU-like su file con TTL per tipo di dato (static vs volatile);
  3. stale-while-error: a monte rotto si serve il dato vecchio etichettato
     `degraded`, invece di far fallire la conversazione;
  4. circuit breaker per Paese con half-open probe (no thundering herd);
  5. retry con backoff esponenziale + jitter solo su errori ritentabili
     (operazioni di lettura = idempotenti per costruzione);
  6. budget anti-loop: numero massimo di chiamate upstream per invocazione e
     per finestra, così l'LLM non può innescare uno scrape indefinito;
  7. kill switch e write-op esplicitamente non implementate (zero rischi di
     pubblicazione accidentale sull'account reale);
  8. audit NDJSON con correlation id, stato del breaker, provenienza del dato.

Dipendenze: solo stdlib (Python >= 3.9). Il backend è qualunque CLI che stampi
JSON su stdout (default: `npx -y @googlarz/vinted-client`).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
from typing import Any, Iterable

try:  # lock inter-process: solo POSIX (il target di deploy e' Linux)
    import fcntl
except ImportError:  # pragma: no cover - Windows/dev box
    fcntl = None

# --------------------------------------------------------------------------- #
# Costanti dipolicy (tutto overridable via env, per non fororkare il codice)
# --------------------------------------------------------------------------- #

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_UNAVAILABLE = 4
EXIT_UPSTREAM = 5

CACHE_KIND_TTL = {
    "search": 600,      # listini volatile: 10 min
    "item": 900,
    "seller": 1800,
    "seller_items": 900,
    "brands": 86_400,   # tassonomia quasi statica
    "categories": 86_400,
    "trending": 300,
    "compare": 600,
    "raw": 900,
}

RETRYABLE = {"rate_limited", "transient", "session_expired"}

# Pass-through generico: qualunque sottocomando read-only del CLI, con qualunque flag.
# Whitelist (non deny-list): il default deve essere il diniego, perche' il comando viene
# composto da un modello. `debug` e' escluso esplicitamente: stampa i cookie di sessione,
# cioe' un segreto, dentro il contesto dell'LLM.
RAW_WHITELIST = {"search", "item", "seller", "seller-items", "brands", "categories", "trending", "compare"}
RAW_DENY = re.compile(
    r"publish|delete|remove|deactivate|reactivate|send|message|like|unlike|favorite|reserve|offer"
    r"|checkout|upload|edit|update|create|debug",
    re.I,
)


COUNTRY_SCOPED = {"search", "item", "seller-items", "categories", "trending", "compare"}
UPSTREAM_COUNTRY_DEFAULT = "fr"  # cosi' come documentato dal CLI a monte


def derive_country(tokens: list[str]) -> str:
    """Il breaker e il pacing sono per Paese: se il Paese e' dentro l'argv (pass-through),
    va portato fuori, altrimenti il gateway proteggerebbe il mercato sbagliato."""
    for i, tok in enumerate(tokens):
        if tok in ("--country", "-c") and i + 1 < len(tokens):
            return tokens[i + 1].strip().lower()
        if tok.startswith("--country="):
            return tok.split("=", 1)[1].strip().lower()
    head = tokens[0] if tokens else ""
    return UPSTREAM_COUNTRY_DEFAULT if head in COUNTRY_SCOPED else "__global__"


def check_raw(tokens: list[str]) -> list[str]:
    """Ritorna la lista dei problemi; vuota = ammissibile."""
    if not tokens:
        return ["argv vuoto: servono almeno il sottocomando e i suoi argomenti posizionali"]
    if tokens[0] not in RAW_WHITELIST:
        msg = f"sottocomando non in whitelist: {tokens[0]!r} (ammessi: {', '.join(sorted(RAW_WHITELIST))})"
        if RAW_DENY.search(tokens[0]):
            msg += (" - escluso perche' ricade nelle operazioni non consentite (scritture) o perche'"
                    " stampa i cookie di sessione (es. `debug`): un segreto non deve entrare nel contesto del modello")
        return [msg]
    joined = " ".join(tokens)
    hit = RAW_DENY.search(joined)
    if hit:
        return [f"token vietato in pass-through: {hit.group(0)!r} (lo shim espone solo letture)"]
    if "--watch" in tokens:
        return ["--watch e' un loop indefinito: non passa dal gateway, usa un cron che richiama search"]
    # Il pass-through non deve poter aggirare il budget: i moltiplicatori di paginazione
    # sono l'unico modo per trasformare una chiamata in migliaia.
    caps = {"--max-pages": 10, "--max-items": 500}
    for i, tok in enumerate(tokens):
        name = tok.split("=", 1)[0]
        if name in caps:
            raw = tok.split("=", 1)[1] if "=" in tok else (tokens[i + 1] if i + 1 < len(tokens) else "")
            try:
                val = int(raw)
            except ValueError:
                return [f"{name} richiede un intero, ricevuto {raw!r}"]
            if val > caps[name]:
                return [f"{name}={val} oltre il tetto del gateway ({caps[name]}): "
                        "la paginazione infinita e' esattamente cio' che il budget deve impedire"]
    return []
COUNTRIES = "fr de uk it es nl pl pt be at lt cz sk hu ro hr fi dk se".split()

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #


@dataclass
class Config:
    backend: list[str]
    home: Path
    ttl_scale: float
    rate_per_sec: float
    burst: float
    global_per_min: float
    timeout_s: float
    max_retries: int
    breaker_failures: int
    breaker_reset_s: float
    max_items_per_call: int
    no_upstream: bool
    stub: bool
    stub_fail: int
    proxy_url: str | None
    # di default lo stato di breaker/budget e' persistito (un processo per chiamata)
    persist_state: bool = True
    pacing_max_wait_s: float = 6.0
    # su `item` con sfida WAF (403) riprova UNA volta con `--browser` (fallback stealth
    # del CLI a monte) prima di arrendersi: costa l'avvio di Chromium, ma trasforma un
    # "dati non disponibili" in un dato vero
    escalate_browser: bool = True
    stub_fail_class: str = "rate_limited"

    @classmethod
    def from_env(cls, overrides: argparse.Namespace | None = None) -> "Config":
        env = os.environ

        def num(key: str, default: float, cast=float):
            raw = env.get(key)
            if raw is None or raw == "":
                return default
            try:
                return cast(raw)
            except ValueError:
                raise SystemExit(f"env {key}: valore non numerico: {raw!r}")

        backend = env.get("VINTED_GATEWAY_CMD")
        # NOTARE: il README indica `npx -y @googlarz/vinted-client search ...`, ma il pacchetto
        # espone DUE bin (vinted, vinted-mcp) e npx risponde "could not determine executable to
        # run". Con due bin serve per forza la forma `-p <pkg> <bin>` (verificato il 2026-09-16).
        backend_argv = shlex.split(backend) if backend else [
            "npx", "-y", "-p", os.environ.get("VINTED_CLIENT_VERSION", "@googlarz/vinted-client@1.1.4"), "vinted"
        ]

        home = Path(env.get("VINTED_GATEWAY_HOME", "~/.cache/vinted-gateway")).expanduser()
        stub_fail = int(num("VINTED_GATEWAY_STUB_FAIL", 0, int))

        cfg = cls(
            backend=backend_argv,
            home=home,
            ttl_scale=num("VINTED_GATEWAY_TTL_SCALE", 1.0),
            rate_per_sec=num("VINTED_GATEWAY_RATE_PER_SEC", 0.5),
            burst=num("VINTED_GATEWAY_BURST", 2.0),
            global_per_min=num("VINTED_GATEWAY_MAX_CALLS_PER_MIN", 60.0),
            timeout_s=num("VINTED_GATEWAY_TIMEOUT_S", 25.0),
            max_retries=int(num("VINTED_GATEWAY_MAX_RETRIES", 2, int)),
            breaker_failures=int(num("VINTED_GATEWAY_BREAKER_FAILURES", 4, int)),
            breaker_reset_s=num("VINTED_GATEWAY_BREAKER_RESET_S", 90.0),
            max_items_per_call=int(num("VINTED_GATEWAY_MAX_ITEMS", 200, int)),
            persist_state=env.get("VINTED_GATEWAY_PERSIST", "1") != "0",
            pacing_max_wait_s=num("VINTED_GATEWAY_PACING_MAX_WAIT_S", 6.0),
            escalate_browser=env.get("VINTED_GATEWAY_ESCALATE_BROWSER", "1") != "0",
            stub_fail_class=env.get("VINTED_GATEWAY_STUB_FAIL_CLASS", "rate_limited"),
            no_upstream=env.get("VINTED_GATEWAY_OFFLINE") == "1",
            stub=env.get("VINTED_GATEWAY_STUB") == "1",
            stub_fail=stub_fail,
            proxy_url=env.get("VINTED_PROXY_URL") or env.get("HTTPS_PROXY"),
        )
        if overrides is not None and getattr(overrides, "force_stub", False):
            cfg.stub = True
        return cfg

    @property
    def cache_dir(self) -> Path:
        return self.home / "cache"

    @property
    def audit_path(self) -> Path:
        return Path(os.environ.get("VINTED_GATEWAY_AUDIT", str(self.home / "audit.ndjson")))

    def ttl(self, kind: str) -> float:
        base = CACHE_KIND_TTL.get(kind, 600)
        override = os.environ.get(f"VINTED_GATEWAY_TTL_{kind.upper()}")
        if override:
            base = float(override)
        return max(1.0, base * self.ttl_scale)


# --------------------------------------------------------------------------- #
# Primitivi di resilienza
# --------------------------------------------------------------------------- #


class TokenBucket:
    """Token bucket thread-safe, refill a tempo reale."""

    def __init__(self, rate_per_sec: float, capacity: float, clock=time.monotonic):
        self.rate = max(rate_per_sec, 1e-6)
        self.capacity = max(capacity, 1.0)
        self._tokens = self.capacity
        self._last = clock()
        self._clock = clock
        self._lock = threading.Lock()

    def _refill(self) -> None:
        now = self._clock()
        self._tokens = min(self.capacity, self._tokens + (now - self._last) * self.rate)
        self._last = now

    def try_acquire(self) -> bool:
        with self._lock:
            self._refill()
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return True
            return False

    def acquire(self, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while True:
            if self.try_acquire():
                return True
            wait = min(0.05, max(0.0, (1.0 - self._tokens) / self.rate))
            if time.monotonic() + wait > deadline:
                return False
            time.sleep(wait or 0.005)

    @property
    def available(self) -> float:
        with self._lock:
            self._refill()
            return self._tokens


class SlidingWindowCounter:
    """Budget globale anti-loop: chiamate upstream ammesse per finestra."""

    def __init__(self, limit_per_min: float, window: float = 60.0):
        self.limit = max(int(limit_per_min), 1)
        self.window = window
        self._hits: list[float] = []
        self._lock = threading.Lock()

    def try_add(self) -> bool:
        now = time.monotonic()
        with self._lock:
            self._hits = [t for t in self._hits if now - t < self.window]
            if len(self._hits) >= self.limit:
                return False
            self._hits.append(now)
            return True

    @property
    def used(self) -> int:
        now = time.monotonic()
        with self._lock:
            return len([t for t in self._hits if now - t < self.window])


class StateStore:
    """Stato condiviso su file JSON con flock.

    Perche' serve: un uso da CLI/MCP lancia UN processo per chiamata. Un breaker
    (o un budget) solo in memoria verrebbe ricostruito a zero a ogni invocation e
    non aprirebbe mai — l'agente potrebbe martellare DataDome all'infinito.
    Persistendolo, N invocazioni separate condividono la stessa protezione.
    """

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    def read(self) -> dict[str, Any]:
        with self.path.open() as fh:
            self._lock(fh, fcntl.LOCK_SH if fcntl else 0)
            try:
                raw = fh.read().strip()
            finally:
                self._unlock(fh)
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def update(self, mutate) -> dict[str, Any]:
        """read-modify-write sotto lock esclusivo (last-writer-wins, idempotente)."""
        with self.path.open("r+") as fh:
            self._lock(fh, fcntl.LOCK_EX if fcntl else 0)
            try:
                raw = fh.read().strip()
                try:
                    state = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    state = {}
                state = mutate(state) or state
                fh.seek(0)
                fh.write(json.dumps(state, sort_keys=True))
                fh.truncate()
            finally:
                self._unlock(fh)
        return state

    @staticmethod
    def _lock(fh, mode) -> None:
        if fcntl and mode:
            try:
                fcntl.flock(fh, mode)
            except OSError:
                pass

    @staticmethod
    def _unlock(fh) -> None:
        if fcntl:
            try:
                fcntl.flock(fh, fcntl.LOCK_UN)
            except OSError:
                pass


CLOSED, OPEN, HALF_OPEN = "closed", "open", "half_open"


class CircuitBreaker:
    """Per Paese: DataDome banna l'IP/per-market, non 'il traffico' in astratto."""

    def __init__(self, failure_threshold: int, reset_timeout: float, half_open_calls: int = 1):
        self.failure_threshold = max(failure_threshold, 1)
        self.reset_timeout = reset_timeout
        self.half_open_calls = half_open_calls
        self.state = CLOSED
        self.failures = 0
        self.opened_at = 0.0
        self._half_open_inflight = 0
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            if self.state == CLOSED:
                return True
            if self.state == OPEN:
                if time.monotonic() - self.opened_at >= self.reset_timeout:
                    self.state = HALF_OPEN
                    self._half_open_inflight = 0
                else:
                    return False
            if self.state == HALF_OPEN:
                if self._half_open_inflight >= self.half_open_calls:
                    return False
                self._half_open_inflight += 1
                return True
            return False

    def record_success(self) -> None:
        with self._lock:
            self.failures = 0
            self.state = CLOSED
            self._half_open_inflight = 0

    def record_failure(self) -> None:
        with self._lock:
            self.failures += 1
            if self.state == HALF_OPEN or self.failures >= self.failure_threshold:
                self.state = OPEN
                self.opened_at = time.monotonic()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "state": self.state,
                "failures": self.failures,
                "seconds_until_probe": (
                    0.0
                    if self.state != OPEN
                    else max(0.0, self.reset_timeout - (time.monotonic() - self.opened_at))
                ),
            }


class PersistentBreaker:
    """Vista persistente di CircuitBreaker: closed/open/half_open sopravvive ai processi."""

    def __init__(self, store: StateStore, country: str, failure_threshold: int, reset_timeout: float,
                 half_open_calls: int = 1):
        self.store = store
        self.country = country
        self.failure_threshold = max(failure_threshold, 1)
        self.reset_timeout = reset_timeout
        self.half_open_calls = half_open_calls

    def _view(self) -> dict[str, Any]:
        raw = self.store.read().get("breakers", {}).get(self.country) or {}
        state = raw.get("state", CLOSED)
        opened_at = float(raw.get("opened_at", 0.0))
        if state == OPEN and time.time() - opened_at >= self.reset_timeout:
            state = HALF_OPEN
        return {"state": state, "failures": int(raw.get("failures", 0)), "opened_at": opened_at,
                "half_open_inflight": int(raw.get("half_open_inflight", 0))}

    def allow(self) -> bool:
        """True = possiamo parlare con l'upstream per questo Paese."""
        decision = {"allowed": True}

        def mutate(state: dict[str, Any]) -> dict[str, Any]:
            b = state.setdefault("breakers", {}).setdefault(self.country, {})
            st = b.get("state", CLOSED)
            opened = float(b.get("opened_at", 0.0))
            inflight = int(b.get("half_open_inflight", 0))
            if st == OPEN:
                if time.time() - opened < self.reset_timeout:
                    decision["allowed"] = False
                    return state
                st, inflight = HALF_OPEN, 0  # finestra di recovery: lasciamo passare un probe
            if st == HALF_OPEN and inflight >= self.half_open_calls:
                decision["allowed"] = False
                return state
            if st == HALF_OPEN:
                inflight += 1
            b.update({"state": st, "half_open_inflight": inflight})
            return state

        self.store.update(mutate)
        return decision["allowed"]

    def record_success(self) -> None:
        def mutate(state: dict[str, Any]) -> dict[str, Any]:
            state.setdefault("breakers", {})[self.country] = {"state": CLOSED, "failures": 0,
                                                               "opened_at": 0.0, "half_open_inflight": 0}
            return state

        self.store.update(mutate)

    def record_failure(self) -> None:
        def mutate(state: dict[str, Any]) -> dict[str, Any]:
            b = state.setdefault("breakers", {}).setdefault(self.country, {})
            failures = int(b.get("failures", 0)) + 1
            st = OPEN if (b.get("state") == HALF_OPEN or failures >= self.failure_threshold) else b.get("state", CLOSED)
            b.update({"state": st, "failures": failures,
                      "opened_at": time.time() if st == OPEN else float(b.get("opened_at", 0.0)),
                      "half_open_inflight": 0 if st == OPEN else int(b.get("half_open_inflight", 0))})
            return state

        self.store.update(mutate)

    @property
    def state(self) -> str:
        return self._view()["state"]

    def snapshot(self) -> dict[str, Any]:
        v = self._view()
        return {
            "state": v["state"],
            "failures": v["failures"],
            "seconds_until_probe": (
                0.0 if v["state"] != OPEN else max(0.0, self.reset_timeout - (time.time() - v["opened_at"]))
            ),
        }


class PersistentBudget:
    """Budget di chiamate upstream per finestra, condiviso fra processi."""

    def __init__(self, store: StateStore, limit_per_min: float, window: float = 60.0):
        self.store = store
        self.limit = max(int(limit_per_min), 1)
        self.window = window

    def try_add(self) -> bool:
        ok = True

        def mutate(state: dict[str, Any]) -> dict[str, Any]:
            nonlocal ok
            now = time.time()
            hits = [t for t in state.get("budget_hits", []) if now - float(t) < self.window]
            if len(hits) >= self.limit:
                ok = False
            else:
                hits.append(now)
            state["budget_hits"] = hits[-(self.limit * 3):]
            state["budget_window_s"] = self.window
            return state

        self.store.update(mutate)
        return ok

    @property
    def used(self) -> int:
        now = time.time()
        return len([t for t in self.store.read().get("budget_hits", []) if now - float(t) < self.window])


class PacingGate:
    """Pacing cross-process per Paese: impone un intervallo minimo reale fra due
    chiamate upstream, anche se l'agente lancia una CLI diversa per ogni turno.

    Il token bucket da solo non basta: vive in memoria e muore con il processo.
    DataDome ragiona per IP + per mercato su finestre di decine di secondi, quindi
    il gate persistente e' la protezione che conta davvero in produzione.
    """

    def __init__(self, store: StateStore, country: str, min_interval_s: float, max_wait_s: float):
        self.store = store
        self.country = country
        self.min_interval = max(min_interval_s, 0.0)
        self.max_wait = max(max_wait_s, 0.0)

    def _slot(self) -> tuple[bool, float]:
        """Prende lo slot se libero; altrimenti dice quanto manca."""

        def mutate(state: dict[str, Any]) -> dict[str, Any]:
            pacing = state.setdefault("pacing", {})
            earliest = float(pacing.get(self.country, 0.0)) + self.min_interval
            now = time.time()
            if now >= earliest:
                pacing[self.country] = now
                return state
            slot_taken[0] = False
            wait[0] = earliest - now
            return state

        slot_taken, wait = [True], [0.0]
        self.store.update(mutate)
        return slot_taken[0], wait[0]

    def acquire(self) -> bool:
        deadline = time.monotonic() + self.max_wait
        while True:
            ok, wait = self._slot()
            if ok:
                return True
            if time.monotonic() + min(wait, 0.05) > deadline:
                return False
            time.sleep(min(wait, 0.05, max(0.005, deadline - time.monotonic())))

    def seconds_until_slot(self) -> float:
        pacing = self.store.read().get("pacing", {})
        return max(0.0, float(pacing.get(self.country, 0.0)) + self.min_interval - time.time())


class FileCache:
    """Cache a file JSON, chiave = sha256 del contesto normale."""

    def __init__(self, directory: Path, max_entries: int = 512):
        self.dir = directory
        self.max_entries = max_entries
        self.dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    @staticmethod
    def key(kind: str, payload: dict[str, Any]) -> str:
        blob = json.dumps({"kind": kind, **payload}, sort_keys=True, separators=(",", ":"))
        return sha256(blob.encode()).hexdigest()[:32]

    def path(self, key: str) -> Path:
        return self.dir / f"{key}.json"

    def get(self, key: str, ttl: float, now: float | None = None) -> tuple[dict[str, Any] | None, str]:
        p = self.path(key)
        if not p.exists():
            return None, "miss"
        try:
            entry = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            return None, "miss"
        now = time.time() if now is None else now
        age = now - float(entry.get("stored_at", 0.0))
        if age < 0:  # clock skew
            return None, "miss"
        if age <= ttl:
            return entry, "cache"
        return entry, "stale"

    def put(self, kind: str, key: str, payload: dict[str, Any], data: Any, ttl: float) -> None:
        entry = {
            "kind": kind,
            "key": key,
            "payload": payload,
            "data": data,
            "stored_at": time.time(),
            "ttl": ttl,
        }
        with self._lock:
            tmp = self.path(key).with_suffix(".tmp")
            tmp.write_text(json.dumps(entry, ensure_ascii=False))
            tmp.replace(self.path(key))
            self._evict_if_needed()

    def _evict_if_needed(self) -> None:
        files = sorted(self.dir.glob("*.json"), key=lambda f: f.stat().st_mtime)
        excess = len(files) - self.max_entries
        for f in files[: max(excess, 0)]:
            f.unlink(missing_ok=True)

    def prune(self, now: float | None = None) -> tuple[int, int]:
        now = time.time() if now is None else now
        kept = dropped = 0
        for f in sorted(self.dir.glob("*.json")):
            try:
                entry = json.loads(f.read_text())
                fresh = now - float(entry.get("stored_at", 0.0)) <= float(entry.get("ttl", 0.0)) * 3
            except (json.JSONDecodeError, OSError, TypeError):
                fresh = False
            if fresh:
                kept += 1
            else:
                f.unlink(missing_ok=True)
                dropped += 1
        return kept, dropped

    def inventory(self) -> list[dict[str, Any]]:
        out = []
        for f in sorted(self.dir.glob("*.json")):
            try:
                entry = json.loads(f.read_text())
            except (json.JSONDecodeError, OSError):
                continue
            out.append(
                {
                    "kind": entry.get("kind"),
                    "key": f.stem,
                    "age_s": round(time.time() - float(entry.get("stored_at", 0.0)), 1),
                    "ttl": entry.get("ttl"),
                }
            )
        return out


class AuditLog:
    """Append-only NDJSON, una riga per chiamata logica."""

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def write(self, event: str, **fields: Any) -> None:
        row = {"ts": round(time.time(), 3), "event": event, **fields}
        line = json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
        with self._lock:
            with self.path.open("a") as fh:
                fh.write(line + "\n")


# --------------------------------------------------------------------------- #
# Classificazione errori upstream (il punto chiave del workaround)
# --------------------------------------------------------------------------- #

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("blocked", re.compile(r"datadome|captcha|403|forbidden|access denied|challenge", re.I)),
    ("rate_limited", re.compile(r"429|too many requests|rate ?limit", re.I)),
    ("session_expired", re.compile(r"401|unauthorized|invalid session|csrf", re.I)),
    ("not_found", re.compile(r"404|not found|no results|empty result", re.I)),
    ("transient", re.compile(r"5\d\d|timeout|timed out|etimedout|econnreset|econnrefused|socket hang|network", re.I)),
]


def classify_error(text: str, returncode: int | None = None) -> dict[str, Any]:
    kind = "transient"
    for candidate, rx in _PATTERNS:
        if rx.search(text or ""):
            kind = candidate
            break
    if returncode in (None, 0) and kind == "not_found":
        kind = "transient"
    retryable = kind in RETRYABLE
    guidance = {
        "blocked": "DataDome ha sfidato il client: ruota proxy residenziale o degrada a sorgente gestita; NON riprovare subito.",
        "rate_limited": "429: rispetta Retry-After, abbassa VINTED_GATEWAY_RATE_PER_SEC, allarga il TTL cache.",
        "session_expired": "401: ri-esegui il bootstrap di sessione (login) e riprova una sola volta.",
        "not_found": "Oggetto/ricerca inesistente: risposta definitiva, non degradare lo stato del circuito.",
        "transient": "Errore di rete/5xx transiente: retry con backoff esponenziale + jitter.",
    }[kind]
    return {
        "class": kind,
        "retryable": retryable,
        "backoff_hint_s": 30.0 if kind == "rate_limited" else (15.0 if kind == "session_expired" else 2.0),
        "guidance": guidance,
    }


# --------------------------------------------------------------------------- #
# Backend (CLI wrapper + stub deterministico per test/offline)
# --------------------------------------------------------------------------- #


@dataclass
class UpstreamResult:
    ok: bool
    data: Any = None
    error: dict[str, Any] | None = None
    raw_len: int = 0


class Backend:
    def __init__(self, cfg: Config):
        self.cfg = cfg

    # -- dispatch verso la CLI reale -------------------------------------- #
    def argv_for(self, kind: str, args: dict[str, Any]) -> list[str]:
        c = self.cfg.backend
        if kind == "raw":
            tokens = list(args["argv"])
            problems = check_raw(tokens)
            if problems:
                raise ValueError("; ".join(problems))
            return [*c, *tokens]
        if kind == "search":
            argv = [*c, "search", str(args["query"])]
            argv += ["--country", args["country"]] if args.get("country") else []
            argv += ["--output", "json"]
            argv += _flags(args, price_min="--price-min", price_max="--price-max", brand="--brand",
                           brand_ids="--brand-ids", category_id="--category-id", size_ids="--size-ids",
                           condition="--condition", sort="--sort", date_from="--date-from",
                           date_to="--date-to", page="--page")
            # il CLI reale accetta --limit 1..100 PER PAGINA; oltre serve --all + --max-items.
            limit = int(args.get("limit") or 20)
            if limit <= 100:
                argv += ["--limit", str(max(1, min(limit, 100)))]
            else:
                argv += ["--all", "--max-items", str(min(limit, self.cfg.max_items_per_call))]
            return argv
        if kind == "item":
            # `item` accetta --country quando gli passi un ID (non un URL) e ha il
            # fallback anti-DataDome `--browser`: lo usiamo come escalation, v. execute()
            argv = [*c, "item", str(args["id"])]
            urlish = str(args["id"]).startswith("http")
            if not urlish and args.get("country"):
                argv += ["--country", args["country"]]
            if args.get("browser"):
                argv += ["--browser"]
            return argv
        if kind == "seller":
            argv = [*c, "seller", str(args["id"])]
            argv += ["--country", args["country"]] if args.get("country") else []
            return argv
        if kind == "seller_items":
            argv = [*c, "seller-items", str(args["id"])]
            argv += ["--country", args["country"]] if args.get("country") else []
            argv += ["--output", "json"]
            if args.get("limit"):
                argv += ["--limit", str(max(1, min(int(args["limit"]), 100)))]
            argv += _flags(args, page="--page")
            return argv
        if kind == "brands":
            argv = [*c, "brands", str(args["query"])]
            argv += ["--country", args["country"]] if args.get("country") else []
            if args.get("limit"):
                argv += ["--limit", str(int(args["limit"]))]
            return argv
        if kind == "categories":
            argv = [*c, "categories"]
            argv += ["--country", args["country"]] if args.get("country") else []
            argv += ["--output", "json"]
            if args.get("query"):
                argv += ["--query", str(args["query"])]
            return argv
        if kind == "trending":
            argv = [*c, "trending"]
            argv += ["--country", args["country"]] if args.get("country") else []
            argv += ["--output", "json"]
            argv += _flags(args, category_id="--category-id")
            if args.get("limit"):
                argv += ["--limit", str(int(args["limit"]))]
            return argv
        raise ValueError(f"kind sconosciuto: {kind}")

    def call(self, kind: str, args: dict[str, Any]) -> UpstreamResult:
        if self.cfg.stub:
            return self._stub(kind, args)
        if self.cfg.no_upstream:
            return UpstreamResult(False, error={"class": "transient", "retryable": True,
                                               "guidance": "VINTED_GATEWAY_OFFLINE=1: upstream disabilitato.",
                                               "backoff_hint_s": 1.0})
        if shutil.which(self.cfg.backend[0]) is None:
            return UpstreamResult(False, error={"class": "transient", "retryable": False,
                                               "guidance": f"backend non trovato: {self.cfg.backend[0]}. "
                                                           "Installa @googlarz/vinted-client o imposta VINTED_GATEWAY_CMD."})
        argv = self.argv_for(kind, args)
        env = dict(os.environ)
        if self.cfg.proxy_url:
            env.setdefault("VINTED_PROXY_URL", self.cfg.proxy_url)
        started = time.monotonic()
        try:
            proc = subprocess.run(argv, capture_output=True, text=True, timeout=self.cfg.timeout_s, env=env)
        except subprocess.TimeoutExpired:
            return UpstreamResult(False, error=classify_error("upstream timeout", 124))
        except OSError as exc:
            return UpstreamResult(False, error=classify_error(f"exec error: {exc}", 127))
        elapsed = round((time.monotonic() - started) * 1000)
        stdout = (proc.stdout or "").strip()
        if proc.returncode != 0:
            text = (stdout + "\n" + (proc.stderr or ""))
            err = classify_error(text or f"exit {proc.returncode}", proc.returncode)
            err.update({"exit_code": proc.returncode, "stderr": _clip(proc.stderr, 400), "elapsed_ms": elapsed})
            return UpstreamResult(False, error=err)
        try:
            return UpstreamResult(True, data=_coerce_json(stdout), raw_len=len(stdout))
        except json.JSONDecodeError:
            return UpstreamResult(False, error=classify_error("invalid json from upstream", 75))

    # -- stub deterministico ------------------------------------------------ #
    def _stub(self, kind: str, args: dict[str, Any]) -> UpstreamResult:
        seed = sha256(json.dumps({"kind": kind, **args}, sort_keys=True).encode()).hexdigest()
        rng = random.Random(int(seed[:12], 16))
        self._stub_calls = getattr(self, "_stub_calls", 0) + 1
        # semantica fault-injection: i primi k TENTATIVI di ogni invocazione falliscono
        if self.cfg.stub_fail and self._stub_calls <= self.cfg.stub_fail:
            sample = {"blocked": "DataDome captcha challenge required",
                      "session_expired": "401 invalid session",
                      "not_found": "404 not found",
                      "transient": "socket hang up",
                      "rate_limited": "HTTP 429 too many requests"}[self.cfg.stub_fail_class]
            err = classify_error(sample, 403 if self.cfg.stub_fail_class == "blocked" else 429)
            err.update({"exit_code": 0, "stderr": "simulated", "elapsed_ms": 12})
            return UpstreamResult(False, error=err)
        if kind == "raw":
            return UpstreamResult(True, data={"argv": list(args.get("argv") or []), "stub": True,
                                              "items": [{"id": rng.randint(1, 9999), "price": round(rng.uniform(8, 140), 2),
                                                         "currency": "EUR"}]})
        if kind in ("search", "trending", "seller_items"):
            n = min(int(args.get("limit") or 5), 12)
            lo = float(args.get("price_min") or 8)
            hi = float(args.get("price_max") or 140)
            hi = max(hi, lo + 1)
            items = [
                {
                    "id": 1_000_000 + rng.randint(0, 899_999),
                    "title": f"{args.get('query', 'articolo')} #{i + 1}",
                    "price": round(rng.uniform(lo, hi), 2),
                    "currency": "EUR",
                    "condition": rng.choice(["new_with_tags", "very_good", "good", "satisfactory"]),
                    "size": rng.choice(["S", "M", "L", "41", "42"]),
                    "country": args.get("country", "it"),
                }
                for i in range(n)
            ]
            return UpstreamResult(True, data={"items": items, "totalResults": len(items)})
        if kind == "item":
            return UpstreamResult(True, data={"id": args["id"], "title": "giacca", "price": 59.9,
                                              "seller_id": 42, "photos": 3,
                                              "fetched_via": "browser" if args.get("browser") else "json_api"})
        if kind == "seller":
            return UpstreamResult(True, data={"id": args["id"], "username": f"utente_{seed[:6]}",
                                              "favourites_count": rng.randint(0, 900),
                                              "items_count": rng.randint(1, 400)})
        if kind == "brands":
            return UpstreamResult(True, data=[{"id": 513, "title": args.get("query", "Nike")}])
        return UpstreamResult(True, data=[{"id": 1, "title": "Abbigliamento"}, {"id": 2, "title": "Calzature"}])


def _flags(args: dict[str, Any], **mapping: str) -> list[str]:
    out: list[str] = []
    for name, flag in mapping.items():
        val = args.get(name)
        if val not in (None, "", [], {}):
            out += [flag, str(val)]
    return out


def _coerce_json(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # alcune CLI stampano righe di log prima del payload: prendi il primo blocco JSON
        for m in re.finditer(r"[\[{]", text):
            start = m.start()
            for end in range(len(text), start, -1):
                chunk = text[start:end]
                if chunk[-1] in "]}":
                    try:
                        return json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
        raise


def _clip(text: str | None, n: int) -> str:
    return (text or "").strip()[:n]


# --------------------------------------------------------------------------- #
# Gateway
# --------------------------------------------------------------------------- #


@dataclass
class Gateway:
    cfg: Config
    _buckets: dict[str, TokenBucket] = field(default_factory=dict)
    _breakers: dict[str, CircuitBreaker] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self.cfg.home.mkdir(parents=True, exist_ok=True)
        self.store = StateStore(self.cfg.home / "state.json")
        self.cache = FileCache(self.cfg.cache_dir)
        self.audit = AuditLog(self.cfg.audit_path)
        self.budget = (PersistentBudget(self.store, self.cfg.global_per_min)
                       if self.cfg.persist_state else SlidingWindowCounter(self.cfg.global_per_min))
        self._stub_seq = 0

    # -- per-Paese --------------------------------------------------------- #
    def bucket(self, country: str) -> TokenBucket:
        with self._lock:
            if country not in self._buckets:
                self._buckets[country] = TokenBucket(self.cfg.rate_per_sec, self.cfg.burst)
            return self._buckets[country]

    def breaker(self, country: str) -> Any:
        """Breaker per Paese; se persist_state=False (default nei test) resta in memoria."""
        with self._lock:
            if country not in self._breakers:
                self._breakers[country] = (
                    PersistentBreaker(self.store, country, self.cfg.breaker_failures, self.cfg.breaker_reset_s)
                    if self.cfg.persist_state
                    else CircuitBreaker(self.cfg.breaker_failures, self.cfg.breaker_reset_s)
                )
            return self._breakers[country]

    # -- percorso principale ---------------------------------------------- #
    def gate(self, country: str) -> PacingGate | None:
        if not self.cfg.persist_state or self.cfg.rate_per_sec <= 0:
            return None
        return PacingGate(self.store, country, 1.0 / self.cfg.rate_per_sec, self.cfg.pacing_max_wait_s)

    def execute(self, kind: str, args: dict[str, Any], correlation_id: str | None = None) -> dict[str, Any]:
        cid = correlation_id or f"vt-{int(time.time() * 1000):x}-{random.randrange(1 << 16):04x}"
        country = str(args.get("country") or "it")
        args = {**args, "country": country}
        ttl = self.cfg.ttl(kind)
        payload = _cache_payload(kind, args)
        key = FileCache.key(kind, payload)
        backend = Backend(self.cfg)
        started = time.monotonic()

        def envelope(**kw: Any) -> dict[str, Any]:
            base = {
                "ok": False,
                "degraded": False,
                "kind": kind,
                "country": country,
                "cache_key": key,
                "ttl_s": round(ttl, 1),
                "correlation_id": cid,
                "latency_ms": round((time.monotonic() - started) * 1000),
                "attempts": 0,
                "source": "upstream",
                "data": None,
            }
            base.update(kw)
            base["breaker"] = self.breaker(country).snapshot()
            return base

        if os.environ.get("VINTED_GATEWAY_DISABLE") == "1":
            self.audit.write("kill_switch", cid=cid, kind=kind)
            return envelope(reason="kill_switch", attempts=0,
                            guidance="VINTED_GATEWAY_DISABLE=1: flusso Vinted spento dall'operatore.")

        entry, state = self.cache.get(key, ttl)
        if state == "cache" and entry is not None:
            self.audit.write("cache_hit", cid=cid, kind=kind, country=country)
            return envelope(ok=True, source="cache", data=entry["data"])

        # -- upstream, con breaker + bucket + budget + retry -------------- #
        if state == "stale" and os.environ.get("VINTED_GATEWAY_REVALIDATE") == "0":
            return envelope(ok=True, degraded=True, source="stale_cache", attempts=0,
                            stale_age_s=round(time.time() - float(entry["stored_at"]), 1),
                            data=entry["data"], reason="revalidation_disabled")

        def stale_ok(reason: str, err: dict[str, Any] | None, attempts_done: int = 0) -> dict[str, Any]:
            """Mai 'ok:false, ho provato 0 volte': il numero di tentativi e' la prima cosa
            che si guarda quando l'upstream e' ostile."""
            if entry is None:
                return envelope(ok=False, degraded=True, source="none", attempts=attempts_done,
                                reason=reason, upstream_error=err)
            return envelope(ok=True, degraded=True, source="stale_cache", attempts=attempts_done,
                            stale_age_s=round(time.time() - float(entry["stored_at"]), 1),
                            data=entry["data"], reason=reason, upstream_error=err)

        if not self.breaker(country).allow():
            snap = self.breaker(country).snapshot()
            if snap["state"] == OPEN:
                self.audit.write("breaker_open", cid=cid, kind=kind, country=country)
                return stale_ok("breaker_open", {"class": "circuit_open",
                                                 "retryable": False,
                                                 "guidance": f"riprova tra {round(snap['seconds_until_probe'])}s "
                                                              "o cambia mercato/proxy."}, 0)

        attempts = 0
        escalated = False
        last_err: dict[str, Any] | None = None
        while True:
            if not self.budget.try_add():
                self.audit.write("budget_exceeded", cid=cid, kind=kind, attempts=attempts)
                return stale_ok("budget_exceeded", {"class": "budget_exceeded", "retryable": True,
                                                    "guidance": f"budget di {int(self.cfg.global_per_min)} "
                                                                 "chiamate/min esaurito: accorpa le query."}, attempts)
            gate = self.gate(country)
            if gate is not None and not gate.acquire():
                last_err = {"class": "local_rate_limit", "retryable": True,
                            "guidance": f"pacing persistente: il prossimo slot per {country.upper()} e' tra "
                                        f"{round(gate.seconds_until_slot(), 2)}s. "
                                        "Non ridurre il pacing: e' cio' che tiene in vita l'IP."}
                if attempts > self.cfg.max_retries:
                    break
                attempts += 1
                continue

            if not self.bucket(country).acquire(timeout=min(6.0, max(1.0, self.cfg.timeout_s / 4))):
                last_err = {"class": "local_rate_limit", "retryable": True,
                            "guidance": "token bucket locale saturo: attendi o alza il burst."}
                if attempts > self.cfg.max_retries:
                    break
                attempts += 1
                time.sleep(min(1.0, 0.25 * attempts))
                continue

            attempts += 1
            result = backend.call(kind, args)
            if result.ok:
                self.breaker(country).record_success()
                data = _trim(result.data, self.cfg.max_items_per_call)
                self.cache.put(kind, key, payload, data, ttl)
                self.audit.write("upstream_ok", cid=cid, kind=kind, country=country, attempts=attempts,
                                 bytes=result.raw_len, breaker=self.breaker(country).snapshot())
                return envelope(ok=True, source="stub" if self.cfg.stub else "upstream",
                                data=data, attempts=attempts)

            last_err = result.error or {"class": "transient", "retryable": True}
            last_err["attempts"] = attempts
            # Escalation: la sfida WAF su un item NON e' (ancora) un guasto del backend,
            # quindi prima di contaminare il breaker proviamo il browser stealth del CLI.
            if (last_err.get("class") == "blocked" and kind == "item" and not escalated
                    and self.cfg.escalate_browser):
                escalated = True
                args = {**args, "browser": True}
                self.audit.write("escalate_browser", cid=cid, kind=kind, country=country,
                                note="retry unico con --browser (fallback anti-DataDome del CLI)")
                continue
            self.breaker(country).record_failure()
            # se la soglia e' stata superata DA QUESTO errore, il loop va interrotto qui:
            # continuare a riprovare con il circuito aperto e' esattamente cio' che trasforma
            # un 429 in un ban di 24 ore.
            if self.breaker(country).snapshot()["state"] == OPEN:
                self.audit.write("breaker_tripped_mid_call", cid=cid, kind=kind, country=country,
                                 attempts=attempts, error=last_err["class"])
                return stale_ok("circuit_open", last_err, attempts)
            if not last_err.get("retryable"):
                self.audit.write("upstream_fail", cid=cid, kind=kind, country=country, error=last_err)
                return stale_ok(last_err["class"], last_err, attempts)
            self.audit.write("upstream_retry", cid=cid, kind=kind, country=country, error=last_err["class"])
            if attempts > self.cfg.max_retries:
                break
            time.sleep(_backoff(attempts, last_err, self.cfg.stub))

        self.audit.write("upstream_exhausted", cid=cid, kind=kind, country=country, attempts=attempts)
        return stale_ok((last_err or {}).get("class", "exhausted"), last_err, attempts)

    # -- fan-out multi-Paese (fail-soft, con statistica difensiva) ------- #
    def compare(self, args: dict[str, Any], correlation_id: str | None = None) -> dict[str, Any]:
        countries = [c.strip().lower() for c in args["countries"] if c and c.strip()]
        unknown = [c for c in countries if c not in COUNTRIES]
        if unknown:
            raise ValueError(f"Paesi non supportati: {', '.join(unknown)} (validi: {', '.join(COUNTRIES)})")
        workers = max(1, min(len(countries), 4))
        cid = correlation_id or f"vt-{int(time.time() * 1000):x}-{random.randrange(1 << 16):04x}"
        per_country: dict[str, Any] = {}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    self.execute,
                    "search",
                    {**args, "country": c, "limit": args.get("limit", 48)},
                    f"{cid}-{c}",
                ): c
                for c in countries
            }
            for fut, country in futures.items():
                per_country[country] = fut.result()

        rows, errors, degraded = [], [], 0
        for country, res in per_country.items():
            if not res["ok"]:
                errors.append({"country": country, "reason": res.get("reason"), "error": res.get("upstream_error")})
                continue
            degraded += int(bool(res.get("degraded")))
            prices = _prices(res.get("data"))
            stats = _price_stats(prices)
            rows.append({"country": country, "sample": stats["n"], "currency": _currency(res.get("data")), **stats,
                         "degraded": bool(res.get("degraded")), "source": res["source"]})
        rows.sort(key=lambda r: (r["median"] is None, r["median"] if r["median"] is not None else 0))
        best = rows[0] if rows and rows[0]["median"] is not None else None
        return {
            "ok": bool(rows),
            "partial": bool(errors),
            "degraded": degraded > 0,
            "query": args.get("query"),
            "correlation_id": cid,
            "countries_requested": countries,
            "countries_ok": [r["country"] for r in rows],
            "cheapest": best,
            "spread_pct": _spread(rows),
            "rows": rows,
            "errors": errors,
            "guidance": _compare_guidance(rows, errors),
        }

    # -- osservabilità ---------------------------------------------------- #
    def stats(self, countries: Iterable[str] = ()) -> dict[str, Any]:
        return {
            "backend": " ".join(self.cfg.backend),
            "stub": self.cfg.stub,
            "offline": self.cfg.no_upstream,
            "kill_switch": os.environ.get("VINTED_GATEWAY_DISABLE") == "1",
            "home": str(self.cfg.home),
            "cache_dir": str(self.cfg.cache_dir),
            "cache_entries": len(list(self.cfg.cache_dir.glob("*.json"))),
            "budget_used_last_60s": self.budget.used,
            "budget_limit_per_min": self.budget.limit,
            "persist_state": self.cfg.persist_state,
            "state_file": str(self.store.path),
            "breakers": {c: b.snapshot() for c, b in self._breakers.items()},
            "breakers_persisted": {c: PersistentBreaker(self.store, c, self.cfg.breaker_failures,
                                                         self.cfg.breaker_reset_s).snapshot()
                                    for c in (self.store.read().get("breakers") or {})},
            "buckets": {c: {"tokens_available": round(b.available, 2)} for c, b in self._buckets.items()},
            "pacing": {
                "min_interval_s": round(1.0 / self.cfg.rate_per_sec, 3) if self.cfg.rate_per_sec > 0 else None,
                "max_wait_s": self.cfg.pacing_max_wait_s,
                "next_slot_in_s": {c: round(self.gate(c).seconds_until_slot(), 2) for c in countries}
                if self.cfg.persist_state
                else {},
            },
        }


def _cache_payload(kind: str, args: dict[str, Any]) -> dict[str, Any]:
    keys = {
        "search": ["query", "country", "price_min", "price_max", "brand", "brand_ids", "category_id",
                   "size_ids", "condition", "sort", "date_from", "date_to", "limit", "page"],
        "item": ["id", "country"],
        "seller": ["id", "country"],
        "seller_items": ["id", "country", "limit", "page"],
        "brands": ["query", "country", "limit"],
        "categories": ["country", "query"],
        "trending": ["country", "category_id", "limit"],
        "raw": ["argv"],
    }[kind]
    return {k: args.get(k) for k in keys if args.get(k) not in (None, "", [])}


def _backoff(attempt: int, err: dict[str, Any], stub: bool = False) -> float:
    if stub:  # nei test/demo non vogliamo perdere secondi veri di sleep
        return 0.01
    hint = float(err.get("backoff_hint_s", 2.0) or 2.0)
    base = min(30.0, max(0.4, hint / 4.0)) * (2 ** (attempt - 1))
    return round(base + random.uniform(0, base * 0.25), 3)


def _trim(data: Any, limit: int) -> Any:
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        items = data["items"][:limit]
        return {**data, "items": items, "returned": len(items), "truncated": len(data["items"]) > limit}
    if isinstance(data, list):
        return data[:limit]
    return data


def _prices(data: Any) -> list[float]:
    items = data.get("items") if isinstance(data, dict) else data
    out: list[float] = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        raw = it.get("price") if it.get("price") is not None else (it.get("info") or {}).get("price")
        if isinstance(raw, dict):
            raw = raw.get("amount") or raw.get("centAmounts")
        if isinstance(raw, (int, float)):
            val = float(raw)
            out.append(val / 100 if val > 5000 else val)  # some APIs return cents
    return [p for p in out if p > 0]


def _currency(data: Any) -> str:
    items = (data.get("items") if isinstance(data, dict) else data) or []
    for it in items:
        if isinstance(it, dict) and it.get("currency"):
            return str(it["currency"])
    return "EUR"


def _price_stats(values: Iterable[float]) -> dict[str, Any]:
    vals = sorted(float(v) for v in values)
    n = len(vals)
    if n == 0:
        return {"n": 0, "min": None, "median": None, "mean": None, "max": None, "p25": None, "p75": None,
                "stddev": None, "quick_sale": None, "confidence": "insufficient_data"}
    med = _percentile(vals, 0.5)
    mean = sum(vals) / n
    # deviazione standard della POPOLAZIONE del campione (non correttarla in n-1:
    # qui il campione e' l'intero set di comparabili osservato nella finestra)
    var = sum((v - mean) ** 2 for v in vals) / n if n > 1 else 0.0
    quick = _percentile(vals, 0.25) if n >= 3 else None
    conf = "insufficient_data" if n < 3 else ("high" if n >= 10 else "medium")
    return {
        "n": n,
        "min": round(vals[0], 2),
        "p25": round(_percentile(vals, 0.25), 2),
        "median": round(med, 2),
        "mean": round(mean, 2),
        "p75": round(_percentile(vals, 0.75), 2),
        "max": round(vals[-1], 2),
        "stddev": round(math.sqrt(var), 2),
        "quick_sale": round(quick, 2) if quick is not None else None,
        "confidence": conf,
    }


def _percentile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    idx = (len(sorted_vals) - 1) * q
    lo, hi = math.floor(idx), math.ceil(idx)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo)


def _spread(rows: list[dict[str, Any]]) -> float | None:
    meds = [r["median"] for r in rows if r.get("median")]
    if len(meds) < 2:
        return None
    return round((max(meds) - min(meds)) / min(meds) * 100, 1)


def _compare_guidance(rows: list[dict[str, Any]], errors: list[dict[str, Any]]) -> str:
    if not rows:
        return "Nessun mercato disponibile: non concludere nulla sul prezzo, degrada a 'dati non disponibili'."
    weak = [r["country"] for r in rows if r["confidence"] != "high"]
    bits = [f"confronto su {len(rows)} mercato/i"]
    if weak:
        bits.append(f"campioni sottili in {', '.join(weak)} (mediana non difensiva)")
    if errors:
        bits.append(f"{len(errors)} mercato/i non raggiungibili")
    return "; ".join(bits) + "."


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


# --------------------------------------------------------------------------- #
# Superficie MCP (stdio, JSON-RPC 2.0) — lo stesso core del CLI, nessun extra
# --------------------------------------------------------------------------- #

MCP_PROTOCOL_FALLBACK = "2025-03-26"
MCP_PROTOCOL_PREFERRED = "2025-06-18"

_TOOL_DOC = (
    "Solo lettura e idempotente. Dietro c'e' il gateway: cache con TTL, token bucket + pacing "
    "per Paese, circuit breaker persistente e budget di chiamate. Su errore a monte puo' "
    "restituire dati vecchi con degraded=true e stale_age_s: NON presentarli come aggiornati. "
    "Nessuna operazione di scrittura e' esposta per scelta (pubblicare/modificare/cancellare "
    "annunci o inviare messaggi resta umano)."
)

TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "vinted_search",
        "description": "Cerca annunci Vinted su un singolo mercato. " + _TOOL_DOC,
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "country": {"type": "string", "enum": COUNTRIES, "default": "it"},
                "price_min": {"type": "number"},
                "price_max": {"type": "number"},
                "brand": {"type": "string", "description": "nome brand, risolto in id a monte"},
                "condition": {"type": "string", "description": "lista separata da virgole: new_with_tags,new_without_tags,very_good,good,satisfactory"},
                "size_ids": {"type": "string"},
                "brand_ids": {"type": "string", "description": "id numerici separati da virgola (alternativa a brand)"},
                "category_id": {"type": "integer", "description": "id categoria, scoperto con vinted_categories"},
                "sort": {"type": "string", "enum": ["relevance", "price_low_to_high", "price_high_to_low", "newest_first"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 500, "default": 24,
                          "description": ">100 attiva la paginazione completa (--all) a monte"},
                "page": {"type": "integer", "minimum": 1},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "vinted_item",
        "description": "Dettaglio di un annuncio per id o URL. " + _TOOL_DOC,
        "inputSchema": {"type": "object",
                        "properties": {"id": {"type": ["string", "integer"], "description": "id annuncio o URL completo"},
                                       "country": {"type": "string", "enum": COUNTRIES, "default": "it",
                                                   "description": "usato solo quando id e' numerico"},
                                       "browser": {"type": "boolean",
                                                   "description": "forza il fallback stealth (Chromium) gia' usato in automatico se DataDome blocca il JSON"}},
                        "required": ["id"], "additionalProperties": False},
    },
    {
        "name": "vinted_seller",
        "description": "Profilo pubblico di un venditore (username, rating, conteggi). "
                       "Dato personale: non persistirlo senza base giuridica. " + _TOOL_DOC,
        "inputSchema": {"type": "object", "properties": {"id": {"type": ["string", "integer"]},
                                                          "country": {"type": "string", "enum": COUNTRIES, "default": "it"}},
                        "required": ["id"], "additionalProperties": False},
    },
    {
        "name": "vinted_seller_items",
        "description": "Annunci attivi di un venditore. " + _TOOL_DOC,
        "inputSchema": {"type": "object", "properties": {"id": {"type": ["string", "integer"]},
                                                          "country": {"type": "string", "enum": COUNTRIES, "default": "it"},
                                                          "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 48},
                                                          "page": {"type": "integer", "minimum": 1}},
                        "required": ["id"], "additionalProperties": False},
    },
    {
        "name": "vinted_compare",
        "description": "Confronto prezzi multi-mercato fail-soft: min/p25/median/mean/p75/max/stddev, "
                       "confidence del campione e guida all'interpretazione per ogni Paese. "
                       "Le statistiche le calcola il gateway, non il modello. " + _TOOL_DOC,
        "inputSchema": {"type": "object",
                        "properties": {"query": {"type": "string"},
                                       "countries": {"type": "array", "items": {"type": "string", "enum": COUNTRIES},
                                                     "default": ["it", "fr", "de"]},
                                       "price_max": {"type": "number"},
                                       "brand": {"type": "string"},
                                       "limit": {"type": "integer", "minimum": 1, "maximum": 96, "default": 48}},
                        "required": ["query"], "additionalProperties": False},
    },
    {"name": "vinted_trending",
     "description": "Ultimi annunci/trending di un mercato, TTL corto (5 min). " + _TOOL_DOC,
     "inputSchema": {"type": "object", "properties": {"country": {"type": "string", "enum": COUNTRIES, "default": "it"},
                                                       "category_id": {"type": "integer"},
                                                       "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 24}},
                     "additionalProperties": False}},
    {"name": "vinted_brands", "description": "Lookup id brand per nome (cache 24 h). " + _TOOL_DOC,
     "inputSchema": {"type": "object", "properties": {"query": {"type": "string"},
                                                      "country": {"type": "string", "enum": COUNTRIES, "default": "it"},
                                                      "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10}},
                     "required": ["query"], "additionalProperties": False}},
    {"name": "vinted_categories", "description": "Albero categorie di un mercato (cache 24 h). " + _TOOL_DOC,
     "inputSchema": {"type": "object", "properties": {"country": {"type": "string", "enum": COUNTRIES, "default": "it"},
                                                       "query": {"type": "string"}}, "additionalProperties": False}},
    {
        "name": "vinted_raw",
        "description": "Pass-through controllato: un sottocomando read-only del CLI Vinted con qualunque "
                       "flag (es. 'categories --country it --query shoes'). Whitelist: "
                       + ", ".join(sorted(RAW_WHITELIST)) + ". Operazioni di scrittura, --watch e `debug` "
                       "(stampa i cookie di sessione) sono rifiutati prima di toccare l'upstream. "
                       "Serve a non dover modificare il gateway quando l'upstream aggiunge un flag. " + _TOOL_DOC,
        "inputSchema": {"type": "object",
                        "properties": {"argv": {"type": "string",
                                                "description": "riga completa dopo il bin, es. 'search nike --country de --all'"}},
                        "required": ["argv"], "additionalProperties": False},
    },
    {"name": "vinted_gateway_stats",
     "description": "Stato operativo del gateway: breaker per Paese, pacing, budget residuo, entries di cache. "
                    "Usalo prima di incolpare il modello per un dato mancante.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
]

TOOL_KIND = {
    "vinted_search": "search",
    "vinted_item": "item",
    "vinted_seller": "seller",
    "vinted_seller_items": "seller_items",
    "vinted_trending": "trending",
    "vinted_brands": "brands",
    "vinted_categories": "categories",
    "vinted_compare": "compare",
    "vinted_raw": "raw",
}


def validate_tool_args(spec: dict[str, Any], args: dict[str, Any]) -> list[str]:
    """Validazione alla frontiera del tool: un MCP che risponde -32602 'argomento mancante'
    e' mille volte piu' utile all'agente di un traceback interno."""
    schema = spec["inputSchema"]
    props = schema.get("properties", {})
    problems: list[str] = []
    for req in schema.get("required", []):
        if args.get(req) in (None, "", []):
            problems.append(f"argomento richiesto mancante: {req!r}")
    for key, val in list(args.items()):
        if key not in props:
            problems.append(f"argomento sconosciuto: {key!r}")
            continue
        rule = props[key]
        enum = rule.get("enum")
        if enum is not None and not isinstance(val, list) and val not in enum:
            problems.append(f"{key}={val!r} non ammesso (validi: {', '.join(map(str, enum[:6]))}...)")
        if rule.get("type") == "integer" and isinstance(val, int):
            lo, hi = rule.get("minimum"), rule.get("maximum")
            if (lo is not None and val < lo) or (hi is not None and val > hi):
                problems.append(f"{key}={val} fuori dall'intervallo [{lo}, {hi}]")
    return problems


def tool_annotations(name: str) -> dict[str, bool]:
    return {
        "title": name.replace("vinted_", "").replace("_", " ").capitalize(),
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }


def handle_mcp_request(gw: "Gateway", req: dict[str, Any]) -> dict[str, Any] | None:
    """Un request -> una response. Ritorna None per le notifiche."""
    rid = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    def result(res: Any) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": rid, "result": res}

    def error(code: int, message: str, data: Any = None) -> dict[str, Any]:
        err: dict[str, Any] = {"code": code, "message": message}
        if data is not None:
            err["data"] = data
        return {"jsonrpc": "2.0", "id": rid, "error": err}

    if method == "initialize":
        proto = params.get("protocolVersion") or MCP_PROTOCOL_FALLBACK
        return result({"protocolVersion": proto if proto != "2025-06-18" else MCP_PROTOCOL_PREFERRED,
                       "capabilities": {"tools": {"listChanged": False}},
                       "serverInfo": {"name": "vinted-gateway", "version": "1.0.0"},
                       "instructions": "Preferisci vinted_compare per qualsiasi giudizio di prezzo: restituisce "
                                       "mediana, distribuzione e confidenza gia' calcolati. Se una risposta ha "
                                       "degraded=true dichiara all'utente l'eta' del dato (stale_age_s). Non "
                                       "chiedere di pubblicare o modificare annunci: non esiste."})
    if method in ("notifications/initialized", "initialized"):
        return None
    if method == "ping":
        return result({})
    if method == "tools/list":
        return result({"tools": [{**t, "annotations": tool_annotations(t["name"])} for t in TOOL_SPECS]})
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if name not in TOOL_KIND and name != "vinted_gateway_stats":
            return error(-32602, f"tool sconosciuto: {name}")
        if name == "vinted_gateway_stats":
            payload = gw.stats(countries=COUNTRIES)
            return result({"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
                           "structuredContent": payload, "isError": False})
        spec = next(t for t in TOOL_SPECS if t["name"] == name)
        problems = validate_tool_args(spec, args)
        if problems:
            return error(-32602, "argomenti non validi: " + "; ".join(problems))
        kind = TOOL_KIND[name]
        if kind == "raw":
            tokens = shlex.split(args.get("argv", ""))
            problems = check_raw(tokens)
            if problems:
                return error(-32602, "pass-through rifiutato: " + "; ".join(problems))
            args = {"argv": tokens, "country": derive_country(tokens)}
        if kind == "compare":
            envelope = gw.compare({**args, "countries": args.get("countries") or ["it", "fr", "de"]},
                                  correlation_id=params.get("_meta", {}).get("correlation_id"))
            ok = bool(envelope.get("ok"))
        else:
            envelope = gw.execute(kind, args, correlation_id=params.get("_meta", {}).get("correlation_id"))
            ok = bool(envelope.get("ok"))
        text = json.dumps(envelope, ensure_ascii=False, default=str)
        if not ok:
            guidance = (envelope.get("upstream_error") or {}).get("guidance") or envelope.get("reason") or "upstream indisponibile"
            text += "\nGUIDA: " + str(guidance)
        return result({"content": [{"type": "text", "text": text}], "structuredContent": envelope,
                       "isError": not ok})
    if method in ("resources/list", "prompts/list"):
        return result({method.split("/")[0]: []})
    return error(-32601, f"metodo non supportato: {method}")


def serve_mcp(gw: "Gateway", stdin=None, stdout=None) -> int:
    """Loop stdio newline-delimited JSON-RPC (la codifica MCP 'stdio')."""
    stdin = stdin or sys.stdin
    stdout = stdout or sys.stdout
    out_lock = threading.Lock()
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            resp = {"jsonrpc": "2.0", "id": None,
                    "error": {"code": -32700, "message": f"parse error: {exc}"}}
        else:
            try:
                resp = handle_mcp_request(gw, req)
            except Exception as exc:  # un MCP non deve mai morire su un tool
                resp = {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32603, "message": f"internal error: {exc}"}}
                gw.audit.write("mcp_crash", error=str(exc), method=req.get("method"))
        if resp is not None:
            with out_lock:
                stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                stdout.flush()
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="vinted_gateway.py",
        description="Shim resiliente (cache, rate-limit, circuit breaker, stale-while-error) attorno a un client Vinted.",
    )
    p.add_argument("--force-stub", action="store_true", help="usa dati sintetici deterministici (demo/test)")
    p.add_argument("--explain", action="store_true", help="stampa il piano (argv, cache key, ttl) senza chiamare upstream")
    p.add_argument("--correlation-id", default=None)
    p.add_argument("--pretty", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_country(sp: argparse.ArgumentParser, default: str = "it") -> None:
        sp.add_argument("--country", default=default, help=f"codice Paese ({', '.join(COUNTRIES)})")

    s = sub.add_parser("search", help="ricerca annunci")
    s.add_argument("--query", required=True)
    add_country(s)
    s.add_argument("--price-min", type=float, dest="price_min")
    s.add_argument("--price-max", type=float, dest="price_max")
    s.add_argument("--brand")
    s.add_argument("--condition", help="es. very_good,good")
    s.add_argument("--size-ids", dest="size_ids")
    s.add_argument("--brand-ids", dest="brand_ids")
    s.add_argument("--category-id", dest="category_id", type=int)
    s.add_argument("--page", type=int)
    s.add_argument("--sort", choices=["relevance", "price_low_to_high", "price_high_to_low", "newest_first"])
    s.add_argument("--date-from", dest="date_from")
    s.add_argument("--date-to", dest="date_to")
    s.add_argument("--limit", type=int, default=24)

    i = sub.add_parser("item", help="dettaglio annuncio")
    i.add_argument("--id", required=True, help="id numerico o URL completo dell'annuncio")
    add_country(i)
    i.add_argument("--browser", action="store_true",
                   help="forza il fallback stealth del CLI (Chromium) se DataDome blocca il JSON")

    sl = sub.add_parser("seller", help="profilo venditore")
    sl.add_argument("--id", required=True)
    add_country(sl)

    si = sub.add_parser("seller-items", help="annunci attivi di un venditore")
    si.add_argument("--id", required=True)
    add_country(si)
    si.add_argument("--limit", type=int, default=48)
    si.add_argument("--page", type=int)

    t = sub.add_parser("trending", help="ultimi/trending")
    add_country(t)
    t.add_argument("--category-id", dest="category_id", type=int)
    t.add_argument("--limit", type=int, default=24)

    b = sub.add_parser("brands", help="lookup id brand")
    b.add_argument("--query", required=True)
    add_country(b)
    b.add_argument("--limit", type=int, default=10)

    cat = sub.add_parser("categories", help="albero categorie")
    add_country(cat)
    cat.add_argument("--query")

    cp = sub.add_parser("compare", help="confronto prezzi multi-paese (fail-soft)")
    cp.add_argument("--query", required=True)
    cp.add_argument("--countries", default="it,fr,de", help="default: it,fr,de")
    cp.add_argument("--price-max", type=float, dest="price_max")
    cp.add_argument("--brand")
    cp.add_argument("--limit", type=int, default=48)

    rw = sub.add_parser("raw", help="pass-through di un sottocomando read-only del CLI (whitelist)")
    rw.add_argument("--argv", required=True, help='es. "categories --country it --query shoes"')
    rw.add_argument("--country", default="it")

    sub.add_parser("mcp", help="server MCP su stdio (JSON-RPC 2.0, newline-delimited)")
    sub.add_parser("stats", help="stato di breaker, bucket, cache e budget")
    sub.add_parser("prune", help="elimina voci di cache troppo vecchie")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = Config.from_env(args)
    gw = Gateway(cfg)

    if args.cmd == "stats":
        return _emit(gw.stats(countries=COUNTRIES), args)
    if args.cmd == "prune":
        kept, dropped = gw.cache.prune()
        return _emit({"kept": kept, "pruned": dropped, "cache_dir": str(cfg.cache_dir)}, args)

    if args.cmd == "raw":
        tokens = shlex.split(args.argv)
        problems = check_raw(tokens)
        if problems:
            print(json.dumps({"ok": False, "degraded": False, "kind": "raw", "reason": "raw_denied",
                              "problems": problems, "argv": tokens}, ensure_ascii=False,
                             indent=None if not args.pretty else 2))
            return EXIT_USAGE
        res = gw.execute("raw", {"argv": tokens, "country": derive_country(tokens)}, args.correlation_id)
        return _emit(res, args, ok=res["ok"], code=EXIT_OK if res["ok"] else EXIT_UPSTREAM)

    if args.cmd == "mcp":
        return serve_mcp(gw)

    kind, call_args = _dispatch(args)
    if args.explain:
        plan = {
            "kind": kind,
            "args": call_args,
            "upstream_argv": Backend(cfg).argv_for(kind, call_args) if kind != "compare" else "(fan-out search x N)",
            "cache_key": FileCache.key(kind, _cache_payload(kind, call_args)),
            "ttl_s": cfg.ttl(kind),
            "rate_per_sec_per_country": cfg.rate_per_sec,
            "max_retries": cfg.max_retries,
            "dry_run": True,
        }
        return _emit(plan, args)

    if kind == "compare":
        res = gw.compare(call_args, args.correlation_id)
        return _emit(res, args, ok=res["ok"])

    res = gw.execute(kind, call_args, args.correlation_id)
    code = EXIT_OK if res["ok"] else (EXIT_UNAVAILABLE if res.get("reason") in
                                     {"breaker_open", "kill_switch", "budget_exceeded"} else EXIT_UPSTREAM)
    return _emit(res, args, ok=res["ok"], code=code)


def _dispatch(args: argparse.Namespace) -> tuple[str, dict[str, Any]]:
    if args.cmd == "search":
        return "search", {k: getattr(args, k) for k in
                          ("query", "country", "price_min", "price_max", "brand", "brand_ids", "category_id",
                           "condition", "size_ids", "sort", "date_from", "date_to", "limit", "page")}
    if args.cmd == "item":
        return "item", {"id": args.id, "country": args.country, "browser": bool(args.browser)}
    if args.cmd == "seller":
        return "seller", {"id": args.id, "country": args.country}
    if args.cmd == "seller-items":
        return "seller_items", {"id": args.id, "country": args.country, "limit": args.limit, "page": args.page}
    if args.cmd == "trending":
        return "trending", {"country": args.country, "category_id": args.category_id, "limit": args.limit}
    if args.cmd == "brands":
        return "brands", {"query": args.query, "country": args.country, "limit": args.limit}
    if args.cmd == "categories":
        return "categories", {"country": args.country, "query": args.query}
    if args.cmd == "compare":
        return "compare", {"query": args.query, "countries": args.countries.split(","), "price_max": args.price_max,
                           "brand": args.brand, "limit": args.limit}
    raise SystemExit(f"comando non gestito: {args.cmd}")


def _emit(payload: dict[str, Any], args: argparse.Namespace, ok: bool = True, code: int | None = None) -> int:
    text = json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None, sort_keys=False, default=str)
    print(text)
    if code is not None:
        return code
    return EXIT_OK if ok else EXIT_UPSTREAM


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
