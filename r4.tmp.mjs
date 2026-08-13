import http from 'http';
import {createClient} from '@supabase/supabase-js';
const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const S=process.env.CRON_SECRET, base="http://localhost:8080/api/public/core/task";
const call=(b)=>fetch(base,{method:"POST",headers:{"content-type":"application/json","x-cron-secret":S},body:JSON.stringify(b)}).then(async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return{error:t.slice(0,120)}}});
const diag=(id,cid,user,type="live")=>call({task:"content-diagnostic",serverId:id,contentId:cid,contentType:type,userId:user});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const log=console.log;
const PAY=Buffer.alloc(300*1024,7);
const srv=http.createServer((req,res)=>{ if(req.url.includes('hang')) return; res.writeHead(200); res.end(PAY); });
await new Promise(r=>srv.listen(9099,'127.0.0.1',r));
const adm=(await sb.from('user_roles').select('user_id').eq('role','admin').limit(1).single()).data.user_id;
const server=(await sb.from('servers').insert({owner_id:adm,name:'TMP-R4',host:'127.0.0.1:9099',monitoring_paused:false,iptv_username:'u',iptv_password:'p'}).select('id').single()).data.id;
const mk=async(email,role)=>{const{data}=await sb.auth.admin.createUser({email,password:'Test!2345678',email_confirm:true});await sb.from('user_roles').insert({user_id:data.user.id,role});return data.user.id;};
const cli=await mk(`c_${Date.now()}@teste.local`,'user'), rev=await mk(`r_${Date.now()}@teste.local`,'reseller');
const clearSrvCooldown=()=>sb.from('diagnostic_concurrency_control').update({last_request_at:new Date(Date.now()-3600e3).toISOString()}).eq('key','server:'+server);
const clearUser=(u)=>sb.from('diagnostic_concurrency_control').delete().eq('key','user:'+u);
const slotSrv=async()=>JSON.stringify((await sb.from('diagnostic_concurrency_control').select('active_count').eq('key','server:'+server)).data);

log('== F) Admin 5/20s vs cliente 1/20s (janelas limpas) ==');
await clearUser(adm); await clearUser(cli);
for(let i=1;i<=6;i++){ await clearSrvCooldown(); const x=await diag(server,'f'+i+'-'+Date.now(),adm); log(' admin run',i,'->',x.status||x.error); }
for(let i=1;i<=2;i++){ await clearSrvCooldown(); const x=await diag(server,'g'+i+'-'+Date.now(),cli); log(' cliente run',i,'->',x.status||x.error); }
log('  -> após 21s a janela reabre:'); await sleep(21000); await clearSrvCooldown();
log('  cliente run3 ->',(await diag(server,'g3-'+Date.now(),cli)).status);

log('\n== G) Admin NÃO burla concorrência do servidor ==');
await clearUser(adm); await clearSrvCooldown();
await sb.from('diagnostic_concurrency_control').update({active_count:2}).eq('key','server:'+server);
log(' admin com servidor lotado ->',(await diag(server,'busy-'+Date.now(),adm)).error||'PASSOU (falha!)');
await sb.from('diagnostic_concurrency_control').update({active_count:0}).eq('key','server:'+server);

log('\n== H) Circuit breaker aberto bloqueia todos os papéis ==');
await sb.from('diagnostic_circuit_breakers').upsert({server_id:server,state:'open',failure_count:9,opened_at:new Date().toISOString(),next_test_at:new Date(Date.now()+300e3).toISOString()},{onConflict:'server_id'});
await clearUser(adm); await clearUser(rev); await clearSrvCooldown();
log(' admin ->',(await diag(server,'b1-'+Date.now(),adm)).error);
await clearSrvCooldown();
log(' revendedor ->',(await diag(server,'b2-'+Date.now(),rev)).error);
await sb.from('diagnostic_circuit_breakers').delete().eq('server_id',server);

log('\n== I) Concorrência real: 2 permitidos, 3º recusado ==');
await clearUser(adm); await clearUser(cli); await clearUser(rev); await clearSrvCooldown();
const par=await Promise.all([diag(server,'p1-hang',cli),diag(server,'p2-hang',rev),diag(server,'p3-hang',adm)]);
log(' resultados:',par.map(x=>x.status||x.error));
log(' slot servidor após:',await slotSrv());

log('\n== J) Cancelar sem execução ativa não deixa flag órfã ==');
log(' cancel sem run:',JSON.stringify(await call({task:'content-diagnostic-cancel',serverId:server,contentId:'zzz',contentType:'live'})));
log(' flags restantes:',JSON.stringify((await sb.from('diagnostic_locks').select('lock_key').ilike('lock_key',`%${server}%`)).data));

await sb.from('content_diagnostics').delete().eq('server_id',server);
await sb.from('diagnostic_concurrency_control').delete().eq('key','server:'+server);
for(const u of [cli,rev,adm]) await clearUser(u);
for(const u of [cli,rev]) await sb.auth.admin.deleteUser(u);
await sb.from('servers').delete().eq('id',server);
srv.close(); process.exit(0);
