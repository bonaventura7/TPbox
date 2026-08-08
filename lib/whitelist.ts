export interface Source { domain: string; name: string; country: string; }
export const WHITELIST: Source[] = [
  {domain:'oecd.org',name:'OECD',country:'INT'},{domain:'oecd-ilibrary.org',name:'OECD iLibrary',country:'INT'},
  {domain:'ec.europa.eu',name:'European Commission',country:'EU'},{domain:'agenziaentrate.gov.it',name:'Agenzia delle Entrate',country:'IT'},
  {domain:'mef.gov.it',name:'MEF',country:'IT'},{domain:'normattiva.it',name:'Normattiva',country:'IT'},
  {domain:'incometaxindia.gov.in',name:'CBDT India',country:'IN'},{domain:'gov.uk',name:'HMRC / UK Government',country:'UK'},
  {domain:'irs.gov',name:'IRS',country:'US'},{domain:'ato.gov.au',name:'ATO Australia',country:'AU'},
  {domain:'cra-arc.gc.ca',name:'CRA Canada',country:'CA'},{domain:'bfd.de',name:'Bundesfinanzdirektion',country:'DE'},
  {domain:'finances.gouv.fr',name:'DGFiP France',country:'FR'}
];
export function extractDomain(url:string){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
export function findSource(domain:string){const d=domain.toLowerCase().replace(/^www\./,'');return WHITELIST.find(s=>d===s.domain||d.endsWith(`.${s.domain}`))??null}
export function isAllowedHost(domain:string){return !!findSource(domain)}
export function canonicalUrl(url:string){try{const u=new URL(url);u.hash='';for(const k of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'])u.searchParams.delete(k);u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString().toLowerCase()}catch{return url.trim().toLowerCase()}}
