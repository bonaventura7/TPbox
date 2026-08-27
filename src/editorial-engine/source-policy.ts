/**
 * Politica sulle fonti dell'Editorial Engine v2.
 *
 * Fail-closed: la fonte primaria deve stare su un dominio istituzionale già
 * censito nella whitelist del progetto (unica lista, nessuna copia locale) e
 * deve puntare a un documento specifico, non alla homepage dell'ente.
 */
import { extractDomain, isAllowedHost, isSpecificPrimaryUrl } from "../../lib/whitelist";
import type { DraftSource } from "./types";

export type SourcePolicyResult = { ok: true } | { ok: false; reason: string };

/** La fonte primaria passa solo se dominio ammesso e URL puntuale. */
export function checkPrimarySourceUrl(url: string): SourcePolicyResult {
  const domain = extractDomain(url);
  if (!domain) return { ok: false, reason: `URL fonte primaria non valida: ${url}` };
  if (!isAllowedHost(domain)) {
    return { ok: false, reason: `dominio fonte primaria non ammesso: ${domain}` };
  }
  if (!isSpecificPrimaryUrl(url)) {
    return { ok: false, reason: `fonte primaria generica (homepage): ${url}` };
  }
  return { ok: true };
}

/** Tutte le fonti PRIMARY devono superare la politica; le SECONDARY sono contesto. */
export function checkDraftSources(sources: DraftSource[]): string[] {
  return sources
    .filter((source) => source.role === "PRIMARY")
    .map((source) => checkPrimarySourceUrl(source.url))
    .filter((result): result is { ok: false; reason: string } => !result.ok)
    .map((result) => result.reason);
}
