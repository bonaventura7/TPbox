import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authorizeCaller, jsonResponse } from '../_shared/auth.ts';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UA='TPBox-Attualita-Bot/1.0';
const WEBHOOK=Deno.env.get('ALERT_WEBHOOK');
const authClient=createClient(SUPABASE_URL,ANON_KEY);
async function status(url:string){const r=await fetch(url,{method:'HEAD',headers:{'user-agent':UA},redirect:'follow',signal:AbortSignal.timeout(20000)}).catch(()=>null);if(r)return r.status;const g=await fetch(url,{headers:{'user-agent':UA},redirect:'follow',signal:AbortSignal.timeout(20000)}).catch(()=>null);return g?.status??0;}
async function alert(text:string){console.error(text);if(WEBHOOK)await fetch(WEBHOOK,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})}).catch(()=>{});}
Deno.serve(async(req:Request)=>{
 const auth=await authorizeCaller(req,authClient,Deno.env.get('NEWS_MONITOR_CALLER_USER_ID'),'news-monitor');
 if(!auth.ok)return auth.response;
 const {correlationId:cid}=auth;

 // Service-role client is created only after caller authorization has passed.
 const supabase=createClient(SUPABASE_URL,SERVICE_KEY);
 const {data:items,error}=await supabase.from('news_items').select('id,slug,source_url,pdf_url,status').eq('status','PUBLISHED').limit(200);
 if(error)return jsonResponse({ok:false,error:error.message},500,cid);
 let retracted=0;
 for(const it of items??[]){const sourceStatus=await status(it.source_url);const pdfStatus=it.pdf_url?await status(it.pdf_url):200;if(sourceStatus<200||sourceStatus>=300||pdfStatus<200||pdfStatus>=300){await supabase.from('news_items').update({status:'RETRACTED'}).eq('id',it.id).eq('status','PUBLISHED');await alert(`TPBox: articolo retratto ${it.slug}; source=${sourceStatus}; pdf=${pdfStatus}`);retracted++;}}
 return jsonResponse({ok:true,checked:(items??[]).length,retracted},200,cid);
});
