import { describe, expect, it } from 'vitest';
import { normalizeRef, runSourceGate } from '../supabase/functions/_shared/source-gate.ts';
import { isAllowedHost } from '../supabase/functions/_shared/whitelist.ts';

const known = new Set(['art. 110 c. 7 TUIR','D.Lgs. 209/2023','OECD TP Guidelines 2022'].map(normalizeRef));
const base={sourceUrl:'https://oecd.org/a.pdf',pdfUrl:'https://oecd.org/a.pdf',bodyText:'Testo articolo',references:['art. 110 c. 7 TUIR'],knownNormativeKeys:known};
const good={checkHttp:async()=>200,checkPdf:async()=>({status:200,contentType:'application/pdf',size:1000}),isDuplicate:async()=>false};

describe('primary source gate',()=>{
 it('PASS only for a valid primary source',async()=>expect((await runSourceGate(base,good)).result).toBe('PASS'));
 it('blocks RegFollower',async()=>expect((await runSourceGate({...base,sourceUrl:'https://regfollower.com/tax/x/'},good)).result).toBe('FAIL_DOMAIN'));
 it('blocks invalid domain',async()=>expect((await runSourceGate({...base,sourceUrl:'notaurl'},good)).result).toBe('FAIL_DOMAIN'));
 it('blocks HTTP errors',async()=>expect((await runSourceGate(base,{...good,checkHttp:async()=>404})).result).toBe('FAIL_HTTP'));
 it('blocks duplicates',async()=>expect((await runSourceGate(base,{...good,isDuplicate:async()=>true})).result).toBe('FAIL_DUP'));
 it('blocks invalid PDF',async()=>expect((await runSourceGate(base,{...good,checkPdf:async()=>({status:200,contentType:'text/html',size:1000})})).result).toBe('FAIL_PDF'));
 it('blocks unknown references',async()=>expect((await runSourceGate({...base,references:['riferimento inventato']},good)).result).toBe('FAIL_REF'));
 it('blocks empty content',async()=>expect((await runSourceGate({...base,bodyText:'   '},good)).result).toBe('FAIL_EMPTY'));
 for (const domain of ['finance.belgium.be','bundesfinanzministerium.de','mof.gov.cy','hasil.gov.my','rijksoverheid.nl','bfd.de']) it(`allows ${domain}`,()=>expect(isAllowedHost(domain)).toBe(true));
 it('keeps regfollower.com blocked',()=>expect(isAllowedHost('regfollower.com')).toBe(false));
});

/**
 * The catalogue lookup used to compare raw lowercased strings, so a reference that was
 * legally identical but written differently was rejected as if it had been invented.
 * These are the spellings a model actually produces for the same provision.
 */
describe('normative reference normalization',()=>{
 const variants=['art. 110 c. 7 TUIR','articolo 110, comma 7, TUIR','art. 110 co. 7 TUIR','ART.110 C.7 TUIR'];
 for (const v of variants) it(`accepts "${v}"`,async()=>expect((await runSourceGate({...base,references:[v]},good)).result).toBe('PASS'));
 it('collapses the variants to one key',()=>expect(new Set(variants.map(normalizeRef)).size).toBe(1));
 it('does not collapse different provisions',()=>expect(normalizeRef('art. 110 c. 7 TUIR')).not.toBe(normalizeRef('art. 110 c. 8 TUIR')));
 it('does not collapse different sources',()=>expect(normalizeRef('D.Lgs. 209/2023')).not.toBe(normalizeRef('D.Lgs. 209/2024')));
 it('still rejects an invented reference',async()=>expect((await runSourceGate({...base,references:['art. 999 c. 1 TUIR']},good)).result).toBe('FAIL_REF'));
});
