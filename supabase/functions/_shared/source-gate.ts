import { canonicalUrl, extractDomain, isAllowedHost, isSpecificPrimaryUrl } from './whitelist.ts';

export type GateResult = 'PASS'|'FAIL_DOMAIN'|'FAIL_HTTP'|'FAIL_DUP'|'FAIL_PDF'|'FAIL_REF'|'FAIL_EMPTY'|'FAIL_UNKNOWN';
export interface GateInput { sourceUrl: string; pdfUrl: string | null; bodyText: string; references: string[]; knownNormativeKeys: Set<string>; }
export interface GateContext { checkHttp(url: string): Promise<number>; checkPdf(url: string): Promise<{status:number;contentType:string;size:number}>; isDuplicate(url:string):Promise<boolean>; }
export interface GateDetail { result: GateResult; checks: Record<string,string>; reason?: string; }

export async function runSourceGate(input: GateInput, ctx: GateContext): Promise<GateDetail> {
  const checks: Record<string,string> = {};
  const domain = extractDomain(input.sourceUrl);
  if (!domain || !isAllowedHost(domain)) return { result:'FAIL_DOMAIN', checks, reason:`dominio non ammesso: ${domain || '(vuoto)'}` };
  if (!isSpecificPrimaryUrl(input.sourceUrl)) return { result:'FAIL_DOMAIN', checks, reason:'homepage istituzionale generica' };
  checks.domain = `ok (${domain})`;

  const status = await ctx.checkHttp(input.sourceUrl);
  if (status < 200 || status >= 300) return { result:'FAIL_HTTP', checks, reason:`source HTTP ${status}` };
  checks.http = String(status);

  if (await ctx.isDuplicate(canonicalUrl(input.sourceUrl))) return { result:'FAIL_DUP', checks, reason:'source_url già presente' };
  checks.dup = 'ok';

  if (input.pdfUrl) {
    const pdf = await ctx.checkPdf(input.pdfUrl);
    if (pdf.status < 200 || pdf.status >= 300 || pdf.contentType.split(';')[0].toLowerCase() !== 'application/pdf' || pdf.size <= 0) {
      return { result:'FAIL_PDF', checks, reason:`PDF invalido: ${pdf.status}/${pdf.contentType}/${pdf.size}` };
    }
    checks.pdf = `ok (${pdf.size}b)`;
  } else checks.pdf = 'skipped';

  const unknown = input.references.filter(r => !input.knownNormativeKeys.has(r.trim().toLowerCase()));
  if (unknown.length) return { result:'FAIL_REF', checks, reason:`riferimenti non validati: ${unknown.join('; ')}` };
  checks.refs = `ok (${input.references.length})`;

  if (!input.bodyText.trim()) return { result:'FAIL_EMPTY', checks, reason:'contenuto vuoto' };
  checks.empty = 'ok';
  return { result:'PASS', checks };
}

export const isPass = (g: GateDetail) => g.result === 'PASS';
