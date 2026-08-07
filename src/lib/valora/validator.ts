/**
 * Inspector deterministico dei metadati del catalogo Valora.
 * Nessuna chiamata di rete: valuta solo ciò che è dichiarato nel catalogo.
 * Non pubblica e non modifica nulla: restituisce finding strutturati.
 */

import { VALORA_ALLOWED_HOSTS, VALORA_VERIFICATION_MAX_AGE_DAYS, valoraCatalog } from "./catalog";
import type {
  InspectionReport,
  QualityFinding,
  ValoraCatalog,
  ValoraItem,
  ValoraSource,
} from "./types";

const MS_DAY = 86_400_000;

export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return VALORA_ALLOWED_HOSTS.includes(parsed.hostname);
}

export function daysSince(date: string, reference: string): number | null {
  const from = Date.parse(`${date}T00:00:00Z`);
  const to = Date.parse(`${reference}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / MS_DAY);
}

function inspectSource(source: ValoraSource, referenceDate: string): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const subject = { subjectId: source.id, subjectKind: "source" as const };

  let parsed: URL | null = null;
  try {
    parsed = new URL(source.officialUrl);
  } catch {
    parsed = null;
  }

  if (!parsed || parsed.protocol !== "https:") {
    findings.push({
      ...subject,
      code: "URL_NOT_HTTPS",
      severity: "ERROR",
      message: `L'URL ufficiale di ${source.name} non è un indirizzo HTTPS valido.`,
    });
  } else if (!VALORA_ALLOWED_HOSTS.includes(parsed.hostname)) {
    findings.push({
      ...subject,
      code: "URL_HOST_NOT_ALLOWED",
      severity: "ERROR",
      message: `Host non presente nell'allowlist: ${parsed.hostname}.`,
    });
  }

  if (source.attribution.trim() === "" || source.licenseNote.trim() === "") {
    findings.push({
      ...subject,
      code: "MANIFEST_INCOMPLETE",
      severity: "WARNING",
      message: `Attribuzione o nota di licenza mancante per ${source.name}.`,
    });
  }

  if (source.lastVerifiedAt === null) {
    findings.push({
      ...subject,
      code: "VERIFICATION_MISSING",
      severity: "WARNING",
      message: `Nessuna verifica registrata per ${source.name}: la fonte va trattata come da verificare.`,
    });
  } else {
    const age = daysSince(source.lastVerifiedAt, referenceDate);
    if (age !== null && age > VALORA_VERIFICATION_MAX_AGE_DAYS) {
      findings.push({
        ...subject,
        code: "VERIFICATION_STALE",
        severity: "WARNING",
        message: `Ultima verifica di ${source.name} risalente a ${age} giorni.`,
      });
    }
  }

  return findings;
}

function inspectItem(item: ValoraItem, catalog: ValoraCatalog): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const subject = { subjectId: item.id, subjectKind: "item" as const };

  if (!catalog.sources.some((source) => source.id === item.sourceId)) {
    findings.push({
      ...subject,
      code: "SOURCE_UNKNOWN",
      severity: "ERROR",
      message: `Il modulo "${item.title}" riferisce una fonte non registrata (${item.sourceId}).`,
    });
  }

  if (item.title.trim() === "" || item.description.trim() === "") {
    findings.push({
      ...subject,
      code: "MANIFEST_INCOMPLETE",
      severity: "ERROR",
      message: `Titolo o descrizione mancanti per ${item.id}.`,
    });
  }

  if (item.mode === "live" && item.status === "DEMO") {
    findings.push({
      ...subject,
      code: "STATUS_MODE_MISMATCH",
      severity: "ERROR",
      message: `"${item.title}" è marcato live ma con stato dimostrativo.`,
    });
  }
  if (item.mode === "demo" && item.status === "LIVE") {
    findings.push({
      ...subject,
      code: "STATUS_MODE_MISMATCH",
      severity: "ERROR",
      message: `"${item.title}" è marcato demo ma con stato operativo.`,
    });
  }

  if (item.version === null) {
    findings.push({
      ...subject,
      code: "VERSION_MISSING",
      severity: item.status === "LIVE" ? "ERROR" : "WARNING",
      message: `Nessuna versione dichiarata per "${item.title}".`,
    });
  }

  if (item.checksum === null) {
    findings.push({
      ...subject,
      code: "CHECKSUM_MISSING",
      severity: "INFO",
      message: `Checksum non disponibile per "${item.title}": il dato non è confrontabile fra due run.`,
    });
  }

  if (item.lastVerifiedAt === null) {
    findings.push({
      ...subject,
      code: "VERIFICATION_MISSING",
      severity: "WARNING",
      message: `Nessuna data di verifica per "${item.title}".`,
    });
  }

  return findings;
}

export function inspectCatalog(
  catalog: ValoraCatalog = valoraCatalog,
  referenceDate: string = catalog.generatedAt,
): InspectionReport {
  const findings: QualityFinding[] = [
    ...catalog.sources.flatMap((source) => inspectSource(source, referenceDate)),
    ...catalog.items.flatMap((item) => inspectItem(item, catalog)),
  ];

  const errors = findings.filter((finding) => finding.severity === "ERROR").length;
  const warnings = findings.filter((finding) => finding.severity === "WARNING").length;

  return {
    checkedAt: referenceDate,
    catalogVersion: catalog.version,
    itemsChecked: catalog.items.length,
    sourcesChecked: catalog.sources.length,
    findings,
    errors,
    warnings,
    passed: errors === 0,
  };
}
