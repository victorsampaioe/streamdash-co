import http from 'http';
import {createClient} from '@supabase/supabase-js';
const URL_=process.env.SUPABASE_URL, SRK=process.env.SUPABASE_SERVICE_ROLE_KEY, ANON=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
const sb=createClient(URL_,SRK);
const S=process.env.CRON_SECRET, base="http://localhost:8080/api/public/core/task";
const call=(b)=>fetch(base,{method:"POST",headers:{"content-type":"application/json","x-cron-secret":S},body:JSON.stringify(b)}).then(async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {error:t.slice(0,160)}}});
const diag=(id,cid,user,type="live")=>call({task:"content-diagnostic",serverId:id,contentId:cid,contentType:type,userId:user});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const log=(...a)=>console.log(...a);

// ---- fake Xtream panel (saudável + travado) ----
const PAY=Buffer.alloc(300*1024,7);
const srv=http.createServer((req,res)=>{
  if(req.url.includes('/hang')) return; // nunca responde
  res.writeHead(200,{'content-type':'video/mp2t'});
  res.end(PAY);
});
await new Promise(r=>srv.listen(9099,'127.0.0.1',r));

const owner=(await sb.from('servers').select('owner_id').limit(1).single()).data.owner_id;
const server=(await sb.from('servers').insert({owner_id:owner,name:'TMP-FINAL-VALIDATION',host:'127.0.0.1:9099',monitoring_paused:false,iptv_username:'u',iptv_password:'p'}).select('id').single()).data.id;
log('server temp:', server);

// ---- usuários de teste ----
async function mkUser(email,role){
  const {data,error}=await sb.auth.admin.createUser({email,password:'Test!2345678',email_confirm:true});
  if(error){log('user err',error.message);return null;}
  const uid=data.user.id;
  await sb.from('user_roles').insert({user_id:uid,role});
  return uid;
}
const cliEmail=`cli_${Date.now()}@teste.local`, revEmail=`rev_${Date.now()}@teste.local`;
const cli=await mkUser(cliEmail,'user');
const rev=await mkUser(revEmail,'reseller');
const adm=(await sb.from('user_roles').select('user_id').eq('role','admin').limit(1).single()).data.user_id;
log('cliente',cli,'revendedor',rev,'admin',adm);

const locks=async()=>JSON.stringify((await sb.from('diagnostic_locks').select('lock_key').ilike('lock_key',`%${server}%`)).data);
const slot=async()=>JSON.stringify((await sb.from('diagnostic_concurrency_control').select('key,active_count,count_20s').eq('key','server:'+server)).data);
const breaker=async()=>JSON.stringify((await sb.from('diagnostic_circuit_breakers').select('*').eq('server_id',server)).data);

log('\n===== FRENTE 2: CASO SAUDÁVEL (cliente) =====');
let t=Date.now(); let r=await diag(server,'101',cli);
log('healthy:',JSON.stringify(r).slice(0,700));
log('wall_ms',Date.now()-t,'locks',await locks(),'slot',await slot());

log('\n===== CACHE (mesmo conteúdo, 2ª chamada) =====');
r=await diag(server,'101',cli);
log('is_cached:',r.is_cached,'status:',r.status,'cached_at:',r.cached_at);

log('\n===== RATE LIMIT não-admin (2ª execução real em <20s) =====');
await sleep(6000);
r=await diag(server,'102',cli);
log('cliente 2º teste (esperado bloqueio):',JSON.stringify(r).slice(0,200));

log('\n===== ADMIN limite maior =====');
r=await diag(server,'201',adm); log('admin #1:',r.status||r.error);
await sleep(6000);
r=await diag(server,'202',adm); log('admin #2 (<20s):',r.status||r.error);

log('\n===== TIMEOUT sem cancelamento (stream travado) =====');
await sleep(6000);
t=Date.now(); r=await diag(server,'hang-1',rev);
log('elapsed_ms',Date.now()-t,'status',r.status,'erro',r.error);
log('locks',await locks(),'slot',await slot());
const brkAfterFail=await breaker(); log('breaker após falha real:',brkAfterFail);

log('\n===== CANCELAMENTO: breaker/rate-limit/locks =====');
await sleep(6000);
const run=diag(server,'hang-2',adm);
await sleep(2500);
await call({task:"content-diagnostic-cancel",serverId:server,contentId:'hang-2',contentType:'live'});
r=await run;
log('cancel result:',r.status,r.duration_ms+'ms');
log('locks',await locks(),'slot',await slot());
log('breaker após cancelamento (deve ser igual ao anterior):',await breaker());
log('rate window admin count_20s:',JSON.stringify((await sb.from('diagnostic_concurrency_control').select('key,count_20s,count_10m,active_count').eq('key','user:'+adm)).data));

log('\n===== CANCELADO NÃO É SERVIDO DO CACHE =====');
await sleep(6000);
r=await diag(server,'hang-2',rev);
log('re-run mesmo alvo -> is_cached:',!!r.is_cached,'status:',r.status);
await call({task:"content-diagnostic-cancel",serverId:server,contentId:'hang-2',contentType:'live'});

log('\n===== CONCORRÊNCIA POR SERVIDOR (3 paralelos, limite 2) =====');
await sleep(6000);
const par=await Promise.all([diag(server,'hang-a',cli),diag(server,'hang-b',rev),diag(server,'hang-c',adm)]);
log(par.map(x=>x.status||x.error));
log('slot final',await slot(),'locks',await locks());

log('\n===== SÉRIE / FILME (rotas de URL) =====');
await sleep(6000);
r=await diag(server,'555',cli,'movie'); log('movie:',r.status,r.bytes_read);
await sleep(6000);
r=await diag(server,'777',rev,'series'); log('series:',r.status,r.bytes_read);

log('\n===== HISTÓRICO (todos os status) =====');
log(JSON.stringify((await sb.from('content_diagnostics').select('status,content_id,duration_ms,ttfb_ms,bytes_read,user_id').eq('server_id',server).order('created_at')).data,null,1));

log('\n===== FRENTE 3: RLS por papel =====');
async function asUser(email){
  const c=createClient(URL_,ANON,{auth:{persistSession:false}});
  const {error}=await c.auth.signInWithPassword({email,password:'Test!2345678'});
  if(error){log('login err',email,error.message);return null;}
  return c;
}
for(const [label,email,uid] of [['cliente',cliEmail,cli],['revendedor',revEmail,rev]]){
  const c=await asUser(email);
  if(!c) continue;
  const {data,error}=await c.from('content_diagnostics').select('id,user_id,status').limit(200);
  const others=(data||[]).filter(r=>r.user_id!==uid);
  log(`${label}: linhas visíveis=${data?.length} | de outros usuários=${others.length} | erro=${error?.message||'-'}`);
  const hist=(data||[]).map(r=>r.status);
  log(`   status próprios: ${JSON.stringify(hist)}`);
  const ins=await c.from('content_diagnostics').insert({user_id:'00000000-0000-0000-0000-000000000000',server_id:server,content_id:'x',content_type:'live',status:'working'});
  log(`   tentativa de gravar em nome de terceiro: ${ins.error? 'BLOQUEADO ('+ins.error.code+')':'PERMITIDO (falha!)'}`);
}

// limpeza
await sb.from('content_diagnostics').delete().eq('server_id',server);
await sb.from('diagnostic_concurrency_control').delete().eq('key','server:'+server);
for(const u of [cli,rev]) if(u) await sb.auth.admin.deleteUser(u);
await sb.from('servers').delete().eq('id',server);
srv.close(); process.exit(0);
