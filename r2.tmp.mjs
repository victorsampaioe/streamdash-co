import http from 'http';
import {createClient} from '@supabase/supabase-js';
const URL_=process.env.SUPABASE_URL, SRK=process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb=createClient(URL_,SRK);
const S=process.env.CRON_SECRET, base="http://localhost:8080/api/public/core/task";
const call=(b)=>fetch(base,{method:"POST",headers:{"content-type":"application/json","x-cron-secret":S},body:JSON.stringify(b)}).then(async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return{error:t.slice(0,140)}}});
const diag=(id,cid,user,type="live")=>call({task:"content-diagnostic",serverId:id,contentId:cid,contentType:type,userId:user});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=console.log;
const PAY=Buffer.alloc(300*1024,7);
const srv=http.createServer((req,res)=>{ if(req.url.includes('hang')) return; res.writeHead(200,{'content-type':'video/mp2t'}); res.end(PAY); });
await new Promise(r=>srv.listen(9099,'127.0.0.1',r));

const adm=(await sb.from('user_roles').select('user_id').eq('role','admin').limit(1).single()).data.user_id;
const server=(await sb.from('servers').insert({owner_id:adm,name:'TMP-R2',host:'127.0.0.1:9099',monitoring_paused:false,iptv_username:'u',iptv_password:'p'}).select('id').single()).data.id;
log('server',server,'admin',adm);
const mk=async(email,role)=>{const{data,error}=await sb.auth.admin.createUser({email,password:'Test!2345678',email_confirm:true});if(error){log(error.message);return null;}await sb.from('user_roles').insert({user_id:data.user.id,role});return data.user.id;};
const users=[]; for(let i=0;i<5;i++) users.push(await mk(`t${i}_${Date.now()}@teste.local`, i%2?'reseller':'user'));
const reset=async()=>{ await sb.from('servers').update({monitoring_paused:false,paused_reason:null}).eq('id',server);
  await sb.from('diagnostic_concurrency_control').update({last_request_at:new Date(Date.now()-3600e3).toISOString()}).eq('key','server:'+server); };
const brk=async()=>JSON.stringify((await sb.from('diagnostic_circuit_breakers').select('state,failure_count').eq('server_id',server)).data);
const locks=async()=>JSON.stringify((await sb.from('diagnostic_locks').select('lock_key').ilike('lock_key',`%${server}%`)).data);
const slot=async()=>JSON.stringify((await sb.from('diagnostic_concurrency_control').select('active_count').eq('key','server:'+server)).data);

log('\n== A) TIMEOUT real sem cancelamento ==');
await reset(); let t=Date.now();
let r=await diag(server,'hang-T',users[0]);
log('elapsed_ms',Date.now()-t,'| status',r.status,'| erro',r.error,'| duration_ms',r.duration_ms);
log('locks',await locks(),'slot',await slot(),'breaker',await brk());

log('\n== B) CANCELAMENTO não conta como falha no breaker ==');
const before=await brk(); await reset(); await sleep(6000);
const run=diag(server,'hang-C',users[1]); await sleep(2500);
await call({task:'content-diagnostic-cancel',serverId:server,contentId:'hang-C',contentType:'live'});
r=await run;
log('status',r.status,'duration',r.duration_ms,'| breaker antes',before,'depois',await brk());
log('locks',await locks(),'slot',await slot());
log('janela do usuário após cancelar:',JSON.stringify((await sb.from('diagnostic_concurrency_control').select('count_20s,count_10m,active_count').eq('key','user:'+users[1])).data));

log('\n== C) Cancelado NÃO vem do cache + rate limit não é resetado ==');
r=await diag(server,'hang-C',users[1]);
log('mesmo usuário logo após cancelar (esperado bloqueio de rate limit):',r.error||r.status);
await reset(); await sleep(6000);
r=await diag(server,'hang-C',users[2]);
log('outro usuário, mesmo alvo -> is_cached:',!!r.is_cached,'| status:',r.status,'| duration:',r.duration_ms);
await call({task:'content-diagnostic-cancel',serverId:server,contentId:'hang-C',contentType:'live'});

log('\n== D) Concorrência por servidor (limite 2, 3 usuários em paralelo) ==');
await reset(); await sleep(2000); await reset();
const par=await Promise.all([diag(server,'hang-x',users[2]),diag(server,'hang-y',users[3]),diag(server,'hang-z',users[4])]);
log(par.map(x=>x.status||x.error));
for(const c of ['hang-x','hang-y','hang-z']) await call({task:'content-diagnostic-cancel',serverId:server,contentId:c,contentType:'live'});
log('slot',await slot(),'locks',await locks());

log('\n== E) Filme e Série (URLs distintas) ==');
await reset(); r=await diag(server,'555',users[3],'movie'); log('movie ->',r.status,r.bytes_read,'bytes, ttfb',r.ttfb_ms);
await reset(); await sleep(6000); r=await diag(server,'777',users[4],'series'); log('series ->',r.status,r.bytes_read,'bytes, ttfb',r.ttfb_ms);

log('\n== F) Admin 5x vs cliente 1x em 20s ==');
await reset(); await sleep(6000);
for(let i=1;i<=3;i++){ await reset(); const x=await diag(server,'adm-'+i+'-'+Date.now(),adm); log(' admin run',i,'->',x.status||x.error); await sleep(1200); }
await reset(); const c1=await diag(server,'cli-1-'+Date.now(),users[0]); log(' cliente run1 ->',c1.status||c1.error);
await reset(); const c2=await diag(server,'cli-2-'+Date.now(),users[0]); log(' cliente run2 (<20s) ->',c2.status||c2.error);

log('\n== G) Admin não burla concorrência do servidor ==');
await reset();
await sb.from('diagnostic_concurrency_control').update({active_count:2}).eq('key','server:'+server);
r=await diag(server,'adm-busy-'+Date.now(),adm);
log('admin com servidor lotado ->',r.status||r.error);
await sb.from('diagnostic_concurrency_control').update({active_count:0}).eq('key','server:'+server);

log('\n== H) Circuit breaker aberto bloqueia ==');
await sb.from('diagnostic_circuit_breakers').upsert({server_id:server,state:'open',failure_count:9,opened_at:new Date().toISOString(),next_test_at:new Date(Date.now()+300e3).toISOString()},{onConflict:'server_id'});
await reset(); r=await diag(server,'brk-'+Date.now(),adm);
log('com circuito aberto (admin) ->',r.status||r.error);
r=await diag(server,'brk2-'+Date.now(),users[0]);
log('com circuito aberto (cliente) ->',r.status||r.error);

log('\n== HISTÓRICO ==');
log(JSON.stringify((await sb.from('content_diagnostics').select('status,content_id,duration_ms,ttfb_ms,bytes_read').eq('server_id',server).order('created_at')).data));

await sb.from('content_diagnostics').delete().eq('server_id',server);
await sb.from('diagnostic_circuit_breakers').delete().eq('server_id',server);
await sb.from('diagnostic_concurrency_control').delete().eq('key','server:'+server);
for(const u of users) if(u) await sb.auth.admin.deleteUser(u);
await sb.from('servers').delete().eq('id',server);
srv.close(); process.exit(0);
