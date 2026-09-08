// ---------- Unternehmensregister — Germania: documenti di bilancio ufficiali ----------
// Adapter server-side resiliente al contratto corrente e legacy del portale ufficiale.

import type { Financials } from "../../types";

const UR_BASE = "https://www.unternehmensregister.de";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface UrResult {
  ok: boolean;
  data?: Financials | undefined;
  error?: string | undefined;
  skipped?: string | undefined;
}

interface UrCompany {
  name?: string;
  location?: string;
  euid?: string;
  registerNumber?: string;
}

interface UrPublication {
  publicationType?: { id?: number; i18n_key?: string };
  companyNameAtTimeOfPublication?: string;
  companyLocation?: string;
  sourceDate?: string;
  title?: string;
  language?: string;
  hasPdf?: boolean;
  esefPub?: boolean;
  xmlPub?: boolean;
  deposit?: boolean;
  encryptedPayload?: string;
  payload?: string;
}

interface SessionResponse {
  token: string;
  cookie: string;
}

function appendSetCookies(cookie: string, headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = typeof getSetCookie === "function"
    ? getSetCookie.call(headers)
    : (headers.get("set-cookie") ?? "").split(/,(?=[^;=]+=)/);

  const jar = new Map<string, string>();
  for (const part of cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part);
  }
  for (const raw of values) {
    const first = raw.trim().split(";", 1)[0];
    const eq = first.indexOf("=");
    if (eq > 0) jar.set(first.slice(0, eq), first);
  }
  return [...jar.values()].join("; ");
}

function rscBlob(html: string): string {
  const chunks = html.match(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g) ?? [];
  const out: string[] = [];
  for (const c of chunks) {
    const m = c.match(/^self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)$/);
    if (!m) continue;
    try {
      out.push(JSON.parse(`"${m[1]}"`));
    } catch {
      /* ignore malformed RSC chunks */
    }
  }
  return out.join("\n");
}

function extractObjects(blob: string, marker: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let i = 0;
  while (true) {
    const at = blob.indexOf(marker, i);
    if (at < 0) break;
    const start = at + marker.length;
    if (blob[start] !== "{") {
      i = at + marker.length;
      continue;
    }
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;
    for (let j = start; j < blob.length && j < start + 20000; j++) {
      const ch = blob[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break;
    try {
      out.push(JSON.parse(blob.slice(start, end + 1)));
    } catch {
      /* ignore non-JSON RSC fragments */
    }
    i = end + 1;
  }
  return out;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return 0.9;
  if (x.includes(y) || y.includes(x)) return 0.75;
  return 0;
}

async function getSession(signal: AbortSignal): Promise<SessionResponse> {
  const res = await fetch(`${UR_BASE}/api/search-token`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`UR search-token HTTP ${res.status}`);
  const j = (await res.json()) as { token?: string } | undefined;
  if (!j?.token) throw new Error("UR: token assente nella risposta");
  return { token: j.token, cookie: appendSetCookies("", res.headers) };
}

async function fetchSearch(
  session: SessionResponse,
  companyName: string,
  mode: "current" | "legacy",
  publicationType?: number,
  signal?: AbortSignal,
): Promise<{ html: string; session: SessionResponse }> {
  const params = new URLSearchParams();
  if (mode === "current") {
    params.set("areas", "all");
    params.set("companySearchTerm", companyName);
    params.set("companyName", companyName);
  } else {
    params.set("area", "ACCOUNTING");
    params.set("companyName", companyName);
    if (publicationType) params.set("publicationType", String(publicationType));
  }
  params.set("searchToken", session.token);

  const res = await fetch(`${UR_BASE}/de/suche?${params.toString()}`, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      ...(session.cookie ? { Cookie: session.cookie } : {}),
      Referer: `${UR_BASE}/de/suche`,
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`UR HTTP ${res.status}`);
  return {
    html: await res.text(),
    session: { ...session, cookie: appendSetCookies(session.cookie, res.headers) },
  };
}

function absoluteCandidate(source: string, href: string): string | undefined {
  try {
    const absolute = new URL(href, source);
    if (absolute.hostname !== new URL(UR_BASE).hostname) return undefined;
    return absolute.toString();
  } catch {
    return undefined;
  }
}

async function resolvePublicationDocument(
  publicationUrl: string,
  session: SessionResponse,
  signal: AbortSignal,
): Promise<string | undefined> {
  const res = await fetch(publicationUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
      ...(session.cookie ? { Cookie: session.cookie } : {}),
      Referer: `${UR_BASE}/de/suche`,
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    },
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`UR publication HTTP ${res.status}`);

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/pdf")) return res.url || publicationUrl;

  const html = await res.text();
  const candidates: string[] = [];
  const regex = /(?:href|src)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(regex)) {
    const href = match[1];
    if (!href) continue;
    const lower = href.toLowerCase();
    if (!(lower.includes("pdf") || lower.includes("download") || lower.includes("dokument") || lower.includes("document") || lower.includes("xml"))) continue;
    const absolute = absoluteCandidate(publicationUrl, href);
    if (absolute) candidates.push(absolute);
  }

  const unique = [...new Set(candidates)];
  for (const candidate of unique.slice(0, 8)) {
    try {
      const probe = await fetch(candidate, {
        headers: {
          "User-Agent": UA,
          Accept: "application/pdf,application/xml,text/xml,*/*;q=0.8",
          ...(session.cookie ? { Cookie: session.cookie } : {}),
          Referer: publicationUrl,
        },
        signal,
        cache: "no-store",
        redirect: "follow",
      });
      if (!probe.ok) continue;
      const type = (probe.headers.get("content-type") ?? "").toLowerCase();
      if (type.includes("application/pdf") || type.includes("application/xml") || type.includes("text/xml")) {
        return probe.url || candidate;
      }
    } catch {
      // probe successivo
    }
  }
  return undefined;
}

export async function searchUrAccounting(companyName: string, timeoutMs = 30000): Promise<UrResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let session = await getSession(ctrl.signal);
    const attempts: Array<{ mode: "current" | "legacy"; type?: number; label: string }> = [
      { mode: "current", label: "contratto corrente" },
      { mode: "legacy", type: 135, label: "Jahres- und Konzernabschluss" },
      { mode: "legacy", type: 86, label: "Rendiconto depositato (HGB)" },
      { mode: "legacy", label: "tutte le pubblicazioni" },
    ];

    let blob = "";
    let lastNote = "";
    for (const attempt of attempts) {
      const result = await fetchSearch(session, companyName, attempt.mode, attempt.type, ctrl.signal);
      session = result.session;
      const b = rscBlob(result.html);
      if (!b) {
        lastNote = `${attempt.label}: payload RSC assente`;
        continue;
      }
      const pubs = extractObjects(b, '"publicationDto":');
      const companies = extractObjects(b, '"companyDto":');
      if (pubs.length > 0 || companies.length > 0) {
        blob = b;
        break;
      }
      lastNote = `${attempt.label}: nessun risultato`;
    }

    if (!blob) {
      return {
        ok: true,
        data: { available: false, years: [], note: `Impresa cercata sul Unternehmensregister: ${lastNote}.` },
      };
    }

    const companies = extractObjects(blob, '"companyDto":').map((c) => c as UrCompany);
    if (companies.length === 0) return { ok: false, error: "UR: nessuna impresa trovata per la ricerca" };

    let best = companies[0];
    let bestScore = similarity(best.name ?? "", companyName);
    for (const c of companies.slice(1)) {
      const score = similarity(c.name ?? "", companyName);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }

    const pubs = extractObjects(blob, '"publicationDto":').map((p) => p as UrPublication);
    if (pubs.length === 0) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: `Impresa trovata al Unternehmensregister (${best.name}), ma nessuna pubblicazione contabile indicizzata.`,
        },
      };
    }

    const companyKey = norm(best.name ?? "");
    const isSameCompany = (p: UrPublication) => {
      const key = norm(p.companyNameAtTimeOfPublication ?? "");
      return !!key && (key === companyKey || key.startsWith(companyKey) || companyKey.startsWith(key));
    };
    const byDate = (a: UrPublication, b: UrPublication) =>
      (b.sourceDate ?? "").localeCompare(a.sourceDate ?? "");
    const isBilancioTitle = (p: UrPublication) =>
      /abschl|bilanz|finanzbericht|annual|consolidat/i.test(p.title ?? "");
    const hasDoc = (p: UrPublication) => !!p.hasPdf || !!p.esefPub || !!p.xmlPub || !!p.payload || !!p.encryptedPayload;

    const own = pubs.filter(isSameCompany).sort(byDate);
    const others = pubs.filter((p) => !isSameCompany(p)).sort(byDate);
    const chosen =
      own.find((p) => isBilancioTitle(p) && hasDoc(p)) ??
      own.find((p) => isBilancioTitle(p)) ??
      own.find(hasDoc) ??
      own[0] ??
      others.find((p) => isBilancioTitle(p) && hasDoc(p)) ??
      others.find(hasDoc) ??
      others[0];

    const documentPayload = chosen?.payload ?? chosen?.encryptedPayload;
    if (!documentPayload) {
      return {
        ok: true,
        data: {
          available: false,
          years: [],
          note: "Pubblicazioni contabili trovate ma prive di documento accessibile.",
        },
      };
    }

    const title = [chosen.title, chosen.companyNameAtTimeOfPublication, chosen.sourceDate]
      .filter(Boolean)
      .join(" · ") || "Documento contabile";
    const publicationParam = chosen.payload ? "payload" : "encryptedPayload";
    const publicationUrl = `${UR_BASE}/de/veroeffentlichung?${publicationParam}=${encodeURIComponent(documentPayload)}`;

    let documentTarget: string | undefined;
    try {
      documentTarget = await resolvePublicationDocument(publicationUrl, session, ctrl.signal);
    } catch {
      documentTarget = undefined;
    }

    const target = documentTarget ?? publicationUrl;
    return {
      ok: true,
      data: {
        available: true,
        years: [],
        source: `Unternehmensregister (DE) — ${chosen.title ?? "Rendiconto"}`,
        documentUrl: `/api/company-finder/document?url=${encodeURIComponent(target)}`,
        documentTitle: title,
        note: documentTarget
          ? "Documento ufficiale del Unternehmensregister risolto server-side fino al documento contabile."
          : "Documento ufficiale del Unternehmensregister individuato; il portale può richiedere una sessione per la visualizzazione.",
      },
    };
  } catch (e) {
    const err = e as { name?: string; message?: string; cause?: { code?: string } } | undefined;
    const code = err?.cause?.code;
    const msg = err?.name === "AbortError" ? "timeout" : code === "ENOTFOUND" ? "dominio non risolto (DNS)" : err?.message ?? "errore";
    return { ok: false, error: `Unternehmensregister: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
