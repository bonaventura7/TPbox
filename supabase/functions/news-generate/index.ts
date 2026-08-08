import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractDomain } from '../_shared/whitelist.ts';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY=Deno.env.get('OPENAI_API_KEY')!;
const supabase=createClient(SUPABASE_URL,SERVICE_KEY);
const CATEGORIES=['TP','VAT','Pillar Two','Anti-Avoidance'];

function slugify(s:string){return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,70)+'-'+crypto.randomUUID().slice(0,8)}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}

async function fetchText(url:string):Promise<string>{
  const r=await fetch(url,{headers:{'user-agent':'TPBox-Attualita-Bot/1.0'},signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw new Error(`source HTTP ${r.status}`);
  const ct=(r.headers.get('content-type')??'').toLowerCase();
  if(ct.includes('pdf') || /\.pdf(?:$|\?)/i.test(url)){
    const {getDocument}=await import('https://deno.land/x/pdfjs@3.11.174/build/pdf.mjs');
    const bytes=new Uint8Array(await r.arrayBuffer());
    const pdf=await getDocument({data:bytes}).promise;
    let text='';
    for(let p=1;p<=pdf.numPages && text.length<16000;p++){
      const page=await pdf.getPage(p); const content=await page.getTextContent();
      text += content.items.map((it:{str?:string})=>it.str??'').join(' ')+'\n';
    }
    text=text.replace(/\s+/g,' ').trim();
    if(!text) throw new Error('PDF non parsabile o privo di testo');
    return text.slice(0,12000);
  }
  const html=await r.text();
  const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  if(!text) throw new Error('source content vuoto');
  return text.slice(0,12000);
}

async function generate(sourceText:string, sourceDomain:string){
  const system=`Sei un redattore fiscale italiano esperto di transfer pricing e fiscalità internazionale.\nScrivi un articolo originale in italiano, esclusivamente come parafrasi della fonte primaria fornita. Non inventare fatti, date, numeri, enti o riferimenti.\nCategoria obbligatoria: TP, VAT, Pillar Two oppure Anti-Avoidance.\nEstrai solo riferimenti normativi esplicitamente presenti nella fonte.\nRispondi SOLO JSON con title, summary, content_markdown, category, country, normative_references. La fonte primaria è ${sourceDomain}.`;
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-4o-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:sourceText}] }),signal:AbortSignal.timeout(60000)});
  if(!r.ok) throw new Error(`LLM HTTP ${r.status}`);
  const data=await r.json(); return JSON.parse(data.choices?.[0]?.message?.content??'{}');
}

Deno.serve(async()=>{
  const {data:discoveries,error}=await supabase.from('news_discovery').select('*').eq('status','SCOUTED').limit(20);
  if(error)return json({ok:false,error:error.message},500);
  const {data:norms}=await supabase.from('normative').select('key');
  const known=new Set((norms??[]).map((x:{key:string})=>x.key.trim().toLowerCase()));
  const created=[];
  for(const d of discoveries??[]){
    try{
      const sourceText=await fetchText(d.source_url);
      const domain=extractDomain(d.source_url);
      const draft=await generate(sourceText,domain);
      if(!CATEGORIES.includes(draft.category)) throw new Error(`categoria non valida: ${draft.category}`);
      const refs=Array.isArray(draft.normative_references)?draft.normative_references.filter((x:unknown)=>typeof x==='string').map((x:string)=>x.trim()):[];
      const unknown=refs.filter((r:string)=>!known.has(r.toLowerCase()));
      if(unknown.length) throw new Error(`riferimenti normativi non presenti nel catalogo: ${unknown.join('; ')}`);
      const {data:dup}=await supabase.from('news_items').select('id').eq('source_url',d.source_url).maybeSingle();
      if(dup) { await supabase.from('news_discovery').update({status:'BLOCKED',gate_result:'FAIL_DUP',error:'source già presente in news_items'}).eq('id',d.id); continue; }
      const {error:insertError}=await supabase.from('news_items').insert({slug:slugify(draft.title),title:draft.title,summary:String(draft.summary??'').slice(0,500),content_markdown:draft.content_markdown??'',category:draft.category,country:draft.country??'INT',source_name:domain,source_url:d.source_url,pdf_url:d.pdf_url??null,normative_references:refs,status:'DRAFT',fetched_at:new Date().toISOString()});
      if(insertError) throw insertError;
      await supabase.from('news_discovery').update({status:'GENERATED',gate_result:'PASS'}).eq('id',d.id);
      created.push(draft.title);
    }catch(e){ await supabase.from('news_discovery').update({status:'BLOCKED',gate_result:'FAIL_UNKNOWN',error:String(e)}).eq('id',d.id); }
  }
  return json({ok:true,created});
});
