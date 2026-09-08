import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SearchResponse } from "./company-finder/types";
import { getCountry } from "./company-finder/countries";
import { officialPageFor } from "./company-finder/official-pages";
import { resolveGreekFilingUrl } from "./company-finder/greek-filing";
import { numericRegistryId, searchGleif } from "./company-finder/sources/gleif";
import {
  fetchLuxembourgFinancials,
  luxembourgRcsFromInput,
  resolveLuxembourgRcsByName,
} from "./company-finder/sources/bilanci/rcsl-lu";

const searchSchema=z.object({query:z.string().max(200).default(""),vat:z.string().max(40).default(""),country:z.string().max(2).default("")});
const POLISH_KRS_REGISTRATION_AUTHORITY="RA000484";
function emptyResponse(warning:string):SearchResponse{return{found:false,sources:[],warnings:[warning],searchedAt:new Date().toISOString()}}
function toInPageDocumentUrl(documentUrl:string){return documentUrl.startsWith("/api/company-finder/document?")?documentUrl:`/api/company-finder/document?url=${encodeURIComponent(documentUrl)}`}
function firstRegistryIdentifier(response:SearchResponse,fallback:string){return response.company?.registry?.id?.trim()||fallback.trim()}
function hideSources(response:SearchResponse):SearchResponse{if(response.company?.nameSource){response.company={...response.company,nameSource:undefined}}if(response.financials){response.financials={...response.financials,source:undefined}}response.officialPage=undefined;response.sources=[];return response}

export interface PolishKrsResolution{krs?:string;detail?:string}
export async function resolvePolishKrsByName(query:string,timeoutMs=10000):Promise<PolishKrsResolution>{const term=query.trim();if(term.length<3)return{detail:"nome troppo corto per la risoluzione KRS"};const result=await searchGleif(term,"PL",timeoutMs);if(!result.ok)return{detail:result.error??"resolver GLEIF non raggiungibile"};for(const match of result.matches){if(match.country!=="PL"||match.registeredAt!==POLISH_KRS_REGISTRATION_AUTHORITY)continue;const registeredAs=numericRegistryId(match.registeredAs);if(!registeredAs)continue;const krs=registeredAs.padStart(10,"0");if(/^\d{10}$/.test(krs))return{krs,detail:`KRS ${krs} risolto da GLEIF → ${POLISH_KRS_REGISTRATION_AUTHORITY}`}}return{detail:"nessuna entità polacca con identificativo KRS verificabile"}}
async function resolveGreekBalance(response:SearchResponse,fallbackId:string):Promise<SearchResponse>{if(response.company?.country.iso!=="GR"||response.financials?.documentUrl)return response;const gemi=firstRegistryIdentifier(response,fallbackId).replace(/\D/g,"");if(!/^\d{10}$/.test(gemi))return response;const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const filingUrl=await resolveGreekFilingUrl(gemi,c.signal);if(!filingUrl)return response;response.financials={...(response.financials??{available:false,years:[]}),documentUrl:filingUrl,documentTitle:"Bilancio ufficiale — ΓΕΜΗ / BusinessPortal iXBRL",source:"ΓΕΜΗ — BusinessPortal iXBRL",note:"Documento iXBRL ufficiale individuato direttamente per la società selezionata."};response.officialPage=undefined;return response}catch{return response}finally{clearTimeout(timer)}}
async function attachPolishFinancialDocuments(response:SearchResponse,krsNumber:string):Promise<SearchResponse>{const krs=krsNumber.replace(/\D/g,"").padStart(10,"0");if(!/^\d{10}$/.test(krs))return response;const rawYears=Array.isArray(response.financials?.years)?response.financials.years:[];const years=rawYears.map((x:unknown)=>typeof x==="number"?x:Number(String(x).match(/20\d{2}/)?.[0])).filter((x:number)=>Number.isInteger(x)&&x>=2000&&x<=2100);const selected=[...new Set(years.length?years:[2024,2023,2022])].sort((a,b)=>b-a);response.financials={...(response.financials??{available:true,years:selected}),available:true,source:"KRS / Ministerstwo Sprawiedliwości — download PDF",note:"Per la Polonia TPbox risolve il KRS e invia la richiesta del PDF tramite relay europeo. L'utente riceve direttamente il file, senza passare dalla pagina generica search_df.",documents:selected.map(year=>({id:`KRS-${krs}-${year}`,year,kind:"ANNUAL_REPORT" as const,format:"pdf" as const,availability:"DOCUMENT_DOWNLOADABLE" as const,title:`Roczne sprawozdanie finansowe ${year}`,downloadUrl:`/api/company-finder/document?country=PL&company=${encodeURIComponent(krs)}&year=${year}&download=1`}))};response.officialPage=undefined;return response}
async function prioritizeBalanceDocument(response:SearchResponse,fallbackId:string):Promise<SearchResponse>{const resolved=await resolveGreekBalance(response,fallbackId),documentUrl=resolved.financials?.documentUrl;if(!documentUrl)return hideSources(resolved);resolved.financials={...resolved.financials!,documentUrl:toInPageDocumentUrl(documentUrl)};return hideSources(resolved)}
async function browserRegistryResponse(countryIso:string,identifier:string,query:string):Promise<SearchResponse|undefined>{const country=getCountry(countryIso);if(!country)return undefined;const officialPage=officialPageFor(countryIso,identifier,query);if(!officialPage)return undefined;const cleaned=identifier.trim();return prioritizeBalanceDocument({found:true,company:{name:query.trim()||`${country.nameIt} — ${cleaned}`,country,registry:{name:officialPage.label,authority:country.registryAuthority,id:cleaned}},financials:{available:false,years:[],note:"Consultazione del registro ufficiale."},sources:[{id:"official-browser",label:officialPage.label,state:"ok",detail:"consultazione ufficiale da browser"}],warnings:[],searchedAt:new Date().toISOString(),officialPage},cleaned)}

async function resolveLuxembourgCompany(query:string, normalized:string):Promise<SearchResponse|undefined>{
  const country=getCountry("LU");
  if(!country)return undefined;

  let rcs=luxembourgRcsFromInput(normalized);
  let companyName=query.trim();
  let resolverDetail="";

  if(!rcs && companyName.length>=3){
    const resolved=await resolveLuxembourgRcsByName(companyName,10000);
    rcs=resolved.rcs;
    companyName=resolved.name||companyName;
    resolverDetail=resolved.detail||"";
  }

  // VAT-only: use the existing orchestrator/VIES once to obtain the legal name,
  // then resolve that name to the Luxembourg RCS through GLEIF.
  if(!rcs && normalized && companyName.length===0){
    const {runSearch}=await import("./company-finder/orchestrator");
    const base=await runSearch({query:"",vat:`LU${normalized}`,country:"LU"});
    companyName=base.company?.name?.trim()||"";
    if(companyName){
      const resolved=await resolveLuxembourgRcsByName(companyName,10000);
      rcs=resolved.rcs;
      companyName=resolved.name||companyName;
      resolverDetail=resolved.detail||"";
    }
    if(!rcs)return hideSources(base);
  }

  if(!rcs)return undefined;

  const financial=await fetchLuxembourgFinancials(rcs,companyName||rcs,25000);
  if(!financial.ok)return undefined;
  const fin=financial.data ?? {available:false,years:[]};
  const officialPage=officialPageFor("LU",rcs,companyName);
  const response:SearchResponse={
    found:true,
    company:{
      name:companyName||`${country.nameIt} — ${rcs}`,
      country,
      registry:{name:country.registryName,authority:country.registryAuthority,id:rcs},
    },
    financials:fin,
    sources:[{id:"rcsl-lu",label:"Luxembourg RCSL — conti annuali",state:"ok",detail:fin.documents?.length?`${fin.documents.length} documenti annuali individuati`:"registro consultabile"}],
    warnings:resolverDetail?[resolverDetail]:[],
    searchedAt:new Date().toISOString(),
    ...(officialPage?{officialPage}:{}),
  };

  return hideSources(response);
}

export const findCompany=createServerFn({method:"POST"}).inputValidator((data:unknown)=>searchSchema.parse(data??{})).handler(async({data}):Promise<SearchResponse>=>{const query=data.query.trim(),vat=data.vat.trim(),country=data.country.trim().toUpperCase(),normalized=vat.replace(/[\s.-]/g,"").toUpperCase();if(!query&&!vat)return emptyResponse("Inserisci la ragione sociale oppure il numero di partita IVA.");if(country==="GR"&&/^\d{10}$/.test(normalized)){const direct=await browserRegistryResponse("GR",normalized,query);if(direct)return direct}if(country==="LU"){const lu=await resolveLuxembourgCompany(query,normalized);if(lu)return lu}let effectiveVat=vat,polishResolution:PolishKrsResolution|undefined;if(country==="PL"&&query.length>=3&&!normalized){polishResolution=await resolvePolishKrsByName(query);if(polishResolution.krs)effectiveVat=`PL${polishResolution.krs}`}const{runSearch}=await import("./company-finder/orchestrator");try{const response=await runSearch({query,vat:effectiveVat,country});if(country==="PL"){const krs=(response.company?.registry?.id??polishResolution?.krs??normalized).replace(/\D/g,"");if(/^\d{8}$|^\d{10}$/.test(krs)){const page=officialPageFor("PL",krs,response.company?.name?.trim()||query);if(page)response.officialPage=page;await attachPolishFinancialDocuments(response,krs)}if(polishResolution)response.warnings=[polishResolution.detail??"Risoluzione KRS effettuata tramite GLEIF",...response.warnings]}return prioritizeBalanceDocument(response,normalized||polishResolution?.krs||"")}catch(error){console.error("[company-finder] errore orchestratore",error);return emptyResponse("Errore interno durante la consultazione delle fonti. Riprova tra qualche istante.")}});
