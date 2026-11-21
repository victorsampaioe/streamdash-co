// Appended to streammonitor-dns-history Worker. The origin identity endpoint
// verifies the JWT before a second, server-side admin role check.
// All returned data is derived from Cloudflare D1; source provenance is private.
async function radarAdminData(request,env,origin){
 const authorization=request.headers.get("authorization")||"";
 const key=request.headers.get("x-sm-public-key")||"";
 if(!/^Bearer [A-Za-z0-9._-]{30,8192}$/.test(authorization)||
    !/^[A-Za-z0-9._-]{15,4096}$/.test(key))
   return output({error:"login_required"},401,origin);
 try{
  const user=await remote(DB_ORIGIN+"/auth/v1/user",authorization,key);
  if(!/^[0-9a-f-]{36}$/i.test(user?.id||""))
    return output({error:"login_required"},401,origin);
  // A verified master account or a live admin-role decision is required.
  let permitted=String(user.email||"").trim().toLowerCase()==="victorsampaio133@gmail.com";
  if(!permitted){
   const roleResponse=await fetch(DB_ORIGIN+"/rest/v1/rpc/has_role",{
     method:"POST",
     headers:{authorization,apikey:key,accept:"application/json","content-type":"application/json"},
     body:JSON.stringify({_user_id:user.id,_role:"admin"}),
     signal:AbortSignal.timeout(7500),
     cf:{cacheTtl:0,cacheEverything:false}
   });
   if(!roleResponse.ok)return output({error:"admin_role_unavailable"},503,origin);
   permitted=(await roleResponse.json())===true;
  }
  if(!permitted)return output({error:"administrator_only"},403,origin);
  if(!env.DNS_DB)return output({error:"radar_unavailable"},503,origin);
  const [states,transitions,run,control]=await Promise.all([
   env.DNS_DB.prepare(
     "SELECT t.server_id,t.host,COALESCE(s.status,'unknown') status,"+
     "COALESCE(s.confidence,'low') confidence,s.first_identified_ms,"+
     "s.last_checked_ms,s.reason_code,s.technical_json "+
     "FROM edge_target_mirror t LEFT JOIN radar_states s ON s.server_id=t.server_id "+
     "WHERE t.active=1 ORDER BY t.host ASC LIMIT 400"
   ).all(),
   env.DNS_DB.prepare(
     "SELECT server_id,to_status,reason_code,occurred_ms FROM radar_transitions "+
     "ORDER BY occurred_ms DESC LIMIT 600"
   ).all(),
   env.DNS_DB.prepare(
     "SELECT finished_ms,targets_seen,states_changed,error_code "+
     "FROM radar_runs ORDER BY started_ms DESC LIMIT 1"
   ).first(),
   env.DNS_DB.prepare(
     "SELECT key,value FROM radar_control WHERE key IN "+
     "('reseller_access_enabled','telegram_dispatch_enabled','feed_ingestion_enabled')"
   ).all()
  ]);
  const histories=new Map();
  for(const h of transitions.results||[]){
   if(!histories.has(h.server_id))histories.set(h.server_id,[]);
   const events=histories.get(h.server_id);
   if(events.length<8)events.push({
     at:new Date(h.occurred_ms).toISOString(),status:h.to_status,
     description:"Alteração identificada pelas verificações do Radar"
   });
  }
  const descriptions={
   reachable_on_tested_networks:"Sem bloqueio identificado nos testes disponíveis.",
   repeated_network_disagreement:"Diferenças persistentes de acesso entre verificações. Situação em investigação.",
   independent_network_evidence:"Restrição confirmada por evidências independentes verificadas.",
   verified_future_record:"Risco de restrição futura documentado, ainda não confirmado.",
   previous_restriction_cleared:"Acesso voltou a responder nas redes verificadas.",
   recovery_monitoring:"Acesso normalizado, sob acompanhamento.",
   recovery_not_yet_verified:"Recuperação ainda não comprovada por testes independentes.",
   insufficient_evidence:"Dados insuficientes para concluir se existe uma restrição."
  };
  const allowedStatuses=new Set(["unknown","normal","possible","confirmed","risk","normalized"]);
  const records=(states.results||[]).map(r=>{
   let tech={};
   try{tech=JSON.parse(r.technical_json||"{}")}catch{}
   const status=allowedStatuses.has(r.status)?r.status:"unknown";
   return {
     id:r.server_id,
     name:r.host,
     host:r.host,
     status,
     confidence:["low","medium","high"].includes(r.confidence)?r.confidence:"low",
     identifiedAt:Number.isFinite(r.first_identified_ms)?new Date(r.first_identified_ms).toISOString():null,
     lastCheckedAt:Number.isFinite(r.last_checked_ms)?new Date(r.last_checked_ms).toISOString():null,
     regions:Array.isArray(tech.regions)?tech.regions.filter(x=>typeof x==="string").slice(0,8):[],
     technicalSummary:descriptions[r.reason_code]||"Aguardando verificação técnica suficiente.",
     history:histories.get(r.server_id)||[]
   };
  });
  const flags=Object.fromEntries((control.results||[]).map(x=>[x.key,x.value]));
  return output({
   verifiedOwnership:true,
   lastUpdatedAt:Number.isFinite(run?.finished_ms)?new Date(run.finished_ms).toISOString():null,
   servers:records,
   overview:{
     mode:"admin_preview",
     scheduled:!!run?.finished_ms,
     scanned:Number(run?.targets_seen||0),
     knownTargets:records.length,
     lastError:run?.error_code||null,
     feedEnabled:flags.feed_ingestion_enabled==="true",
     notificationsEnabled:flags.telegram_dispatch_enabled==="true",
     resellerAccessEnabled:flags.reseller_access_enabled==="true"
   }
  },200,origin);
 }catch{
  return output({error:"radar_admin_temporarily_unavailable"},503,origin);
 }
}
