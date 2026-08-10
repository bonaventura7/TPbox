import { describe, expect, it } from 'vitest';
import { runSourceGate } from '../lib/source-gate';
import { isAllowedHost } from '../lib/whitelist';

const known = new Set(['art. 110 c. 7 tuir','d.lgs. 209/2023','oecd tp guidelines 2022']);
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