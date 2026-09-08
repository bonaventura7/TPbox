import type { Financials } from "../../types";
import { fetchOpenRegisterFinancials } from "./openregister-de";

const UR_BASE = "https://www.unternehmensregister.de";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
type JsonObject = Record<string, unknown>;
export interface UrResult { ok: boolean; data?: Financials; error?: string; skipped?: string }
interface UrCompany { name?: string }
interface UrPublication { companyNameAtTimeOfPublication?: string; sourceDate?: string; title?: string; hasPdf?: boolean; payload?: string; encryptedPayload?: string }
function env(): Record<string, string | undefined> { return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}; }
function norm(s: string): string { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase(); }
function similarity(a: string, b: string): number { const x = norm(a), y = norm(b); if (!x || !y) return 0; if (x === y) return 1; if (x.startsWith(y) || y.startsWith(x)) return 0.9; if (x.includes(y) || y.includes(x)) return 0.75; return 0; }
function appendSetCookies(cookie: string, headers: Headers): string { const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie; const values = typeof getSetCookie === "function" ? getSetCookie.call(headers) : (headers.get("set-cookie") ?? "").split(/,(?=[^;=]+=)/); const jar = new Map<string, string>(); for (const part of cookie.split("; ")) { const eq = part.indexOf("="); if (eq > 0) jar.set(part.slice(0, eq), part); } for (const raw of values) { const first = raw.trim().split(";", 1)[0]; const eq = first.indexOf("="); if (eq > 0) jar.set(first.slice(0, eq), first); } return [...jar.values()].join("; "); }
function rscBlob(html: string): string { const chunks = html.match(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g) ?? []; const out: string[] = []; for (const chunk of chunks) { const match = chunk.match(/^self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)$/); if (!match) continue; try { out.push(JSON.parse(`"${match[1]}"`)); } catch {} } return out.join("\n"); }
function extractObjects(blob: string, marker: string): JsonObject[] { const out: JsonObject[] = []; let cursor = 0; while (true) { const at = blob.indexOf(marker, cursor); if (at < 0) break; const start = at + marker.length; if (blob[start] !== "{") { cursor = start; continue; } let depth = 0, end = -1, inString = false, escaped = false; for (let i = start; i < blob.length && i < start + 20000; i++) { const ch = blob[i]; if (escaped) { escaped = false; continue; } if (ch === "\\" && inString) { escaped = true; continue; } if (ch === '"') { inString = !inString; continue; } if (inString) continue; if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } } } if (end < 0) break; try { out.push(JSON.parse(blob.slice(start, end + 1)) as JsonObject); } catch {} cursor = end + 1; } return out; }
async function searchOfficialUr(companyName: string, timeoutMs: number): Promise<UrResult> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let cookie = "";
    try { const boot = await fetch(`${UR_BASE}/de/suche`, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" }, signal: ctrl.signal, cache: "no-store" }); if (boot.ok) cookie = appendSetCookies(cookie, boot.headers); } catch {}
    const tokenRes = await fetch(`${UR_BASE}/api/search-token`, { headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}), Referer: `${UR_BASE}/de/suche` }, signal: ctrl.signal, cache: "no-store" });
    if (!tokenRes.ok) return { ok: false, error: `UR search-token HTTP ${tokenRes.status}` };
    const tokenBody = (await tokenRes.json()) as { token?: string }; if (!tokenBody.token) return { ok: false, error: "UR: token assente" }; cookie = appendSetCookies(cookie, tokenRes.headers);
    const params = new URLSearchParams({ areas: "all", companySearchTerm: companyName, companyName, searchToken: tokenBody.token });
    const searchRes = await fetch(`${UR_BASE}/de/suche?${params.toString()}`, { headers: { "User-Agent": UA, Accept: "text/html", ...(cookie ? { Cookie: cookie } : {}), Referer: `${UR_BASE}/de/suche`, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" }, signal: ctrl.signal, cache: "no-store" });
    if (!searchRes.ok) return { ok: false, error: `UR search HTTP ${searchRes.status}` };
    const blob = rscBlob(await searchRes.text()); const companies = extractObjects(blob, '"companyDto":') as UrCompany[]; const publications = extractObjects(blob, '"publicationDto":') as UrPublication[];
    if (!publications.length) return { ok: true, data: { available: false, years: [], source: "Bilancio annuale", note: "Nessuna pubblicazione contabile trovata." } };
    const best = companies.sort((a, b) => similarity(b.name ?? "", companyName) - similarity(a.name ?? "", companyName))[0]; const companyKey = norm(best?.name ?? companyName);
    const sameCompany = publications.filter((p) => { const key = norm(p.companyNameAtTimeOfPublication ?? ""); return !key || key === companyKey || key.startsWith(companyKey) || companyKey.startsWith(key); }); sameCompany.sort((a,b)=>(b.sourceDate??"").localeCompare(a.sourceDate??""));
    const chosen = sameCompany.find((p) => /abschl|bilanz|finanzbericht|annual/i.test(p.title ?? "")) ?? sameCompany[0] ?? publications[0]; if (!chosen) return { ok: true, data: { available: false, years: [], source: "Bilancio annuale", note: "Nessuna pubblicazione contabile trovata." } };
    if (!chosen.payload && !chosen.encryptedPayload) return { ok: true, data: { available: false, years: [], source: "Bilancio annuale", note: "Il documento annuale non è disponibile automaticamente in questo momento." } };
    const yearMatch = (chosen.sourceDate ?? chosen.title ?? "").match(/20\d{2}/); return { ok: true, data: { available: false, years: [], source: "Bilancio annuale", documentTitle: [chosen.title, chosen.companyNameAtTimeOfPublication, chosen.sourceDate].filter(Boolean).join(" · "), availability: "REGISTRY_ONLY", restriction: "SOURCE_RESTRICTION", note: yearMatch ? `Bilancio annuale ${yearMatch[0]} individuato ma non disponibile tramite il canale documentale automatico.` : "Bilancio annuale individuato ma non disponibile tramite il canale documentale automatico." } };
  } catch (e) { const err = e as { name?: string; message?: string; cause?: { code?: string } } | undefined; const code = err?.cause?.code; return { ok: false, error: `registro documentale: ${err?.name === "AbortError" ? "timeout" : code === "ENOTFOUND" ? "DNS non risolto" : err?.message ?? "errore"}` }; }
  finally { clearTimeout(timer); }
}
export async function searchUrAccounting(companyName: string, timeoutMs = 30000): Promise<UrResult> {
  const key = env().OPENREGISTER_API_KEY?.trim();
  if (key) { const structured = await fetchOpenRegisterFinancials(companyName, key, Math.min(timeoutMs, 15000)); if (structured.ok && structured.data) return structured; const fallback = await searchOfficialUr(companyName, timeoutMs); if (fallback.data) fallback.data = { ...fallback.data, source: "Bilancio annuale", documentUrl: undefined, documentTitle: undefined, documents: undefined, availability: "REGISTRY_ONLY", restriction: "SOURCE_UNAVAILABLE", note: `Il servizio documentale automatico non è disponibile al momento. ${fallback.data.note ?? ""}`.trim() }; return fallback; }
  const fallback = await searchOfficialUr(companyName, timeoutMs); if (fallback.data) fallback.data = { ...fallback.data, source: "Bilancio annuale", documentUrl: undefined, documentTitle: undefined, documents: undefined, availability: "REGISTRY_ONLY", restriction: "SOURCE_RESTRICTION", note: "Il documento annuale è stato individuato, ma il canale documentale automatico non è disponibile al momento." }; return fallback;
}
