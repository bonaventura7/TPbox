import { createClient } from 'jsr:@supabase/supabase-js@2';
import { canonicalUrl } from '../_shared/whitelist.ts';
import { runSourceGate, isPass } from '../_shared/source-gate.ts';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTO_PUBLISH=Deno.env.get('AUTO_PUBLISH_ENABLED')==='true';
const UA='TPBox-Attualita-Bot/1.0';
const supabase=createClient(SUPABASE_URL,SERVICE_KEY);

async function http(url:string){
  const h={'user-agent':UA};
  const r=await fetch(url,{method:'HEAD',headers:h,signal:AbortSignal.timeout(20000)}).catch(()=>null);
  if(r) return r;
  return fetch(url,{headers:h,signal:AbortSignal.timeout(20000)});
}
const ctx={
  async checkHttp(url:string){return (await http(url)).status;},
  async checkPdf(url:string){const r=await http(url);return {status:r.status,contentType:r.headers.get('content-type')??'',size:Number(r.headers.get('content-length')??0)};},
  async isDuplicate(url:string){const {data}=await supabase.from('news_items').select('id').eq('source_url',canonicalUrl(url)).eq('status','PUBLISHED').limit(1);return (data??[]).length>0;}
};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}

Deno.serve(async()=>{
  if(!AUTO_PUBLISH)return json({ok:true,published:0,blocked:0,kill_switch:true,note:'AUTO_PUBLISH_ENABLED=false — nessun articolo pubblicato'});
  const {data:items,error}=await supabase.from('news_items').select('*').eq('status','DRAFT').limit(20);
  if(error)return json({ok:false,error:error.message},500);
  const {data:norms}=await supabase.from('normative').select('key');
  const known=new Set((norms??[]).map((x:{key:string})=>x.key.trim().toLowerCase()));
  let published=0,blocked=0; const details=[];
  for(const it of items??[]){
    const gate=await runSourceGate({sourceUrl:it.source_url,pdfUrl:it.pdf_url??null,bodyText:it.content_markdown??it.summary??'',references:Array.isArray(it.normative_references)?it.normative_references:[],knownNormativeKeys:known},ctx);
    await supabase.from('news_gate_log').insert({news_id:it.id,gate_result:gate.result,details:{...gate.checks,reason:gate.reason??null}});
    if(isPass(gate)){
      const {error:updateError}=await supabase.from('news_items').update({status:'PUBLISHED',published_at:new Date().toISOString()}).eq('id',it.id).eq('status','DRAFT');
      if(updateError){blocked++;details.push({id:it.id,result:'UPDATE_FAILED'});}
      else {published++;details.push({id:it.id,result:'PUBLISHED'});}
    }else{
      await supabase.from('news_items').update({status:'DRAFT'}).eq('id',it.id);
      blocked++;details.push({id:it.id,result:'BLOCKED',gate:gate.result,reason:gate.reason});
    }
  }
  return json({ok:true,published,blocked,details});
});
