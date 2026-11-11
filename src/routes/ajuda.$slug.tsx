import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ArrowRight, CheckCircle2, CircleHelp, Clock3, Copy, LifeBuoy, MonitorPlay, ShieldCheck, Smartphone, Tv2, Wifi, Wrench, ChevronLeft, MessageCircle, Globe, AlertTriangle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/ajuda/$slug")({
  component: PublicResellerHelp,
  head: ({params})=>({meta:[
    {title:`Ajuda e diagnóstico | ${params.slug}`},
    {name:"description",content:"Central de ajuda do revendedor: verifique o servidor e resolva problemas comuns de reprodução em poucos passos."},
    {name:"robots",content:"noindex,follow"},
  ]})
});

type PublicServer = { id:string;name:string;dns_label:string|null;status:"up"|"down"|"dns_issue"|"unstable"|"unknown";checked_at:string|null };
type PublicPage = {name:string;tagline:string|null;intro:string|null;logo_url:string|null;primary_color:string|null;accent_color:string|null;whatsapp:string|null;servers:PublicServer[]};
type Symptom = "buffer"|"black"|"login"|"vod"|"live"|"audio"|"other";
type Device = "smart"|"box"|"mobile"|"pc";
const symptoms:{id:Symptom;label:string;emoji:string;hint:string}[]=[
  {id:"buffer",label:"Travando ou carregando",emoji:"⏳",hint:"Buffering, pausas ou lentidão"},
  {id:"black",label:"Tela preta ou erro no vídeo",emoji:"📺",hint:"O conteúdo não abre"},
  {id:"login",label:"Não consigo entrar",emoji:"🔐",hint:"Login, senha ou assinatura"},
  {id:"vod",label:"Filmes e séries",emoji:"🎬",hint:"Apenas conteúdos sob demanda"},
  {id:"live",label:"TV ao vivo",emoji:"📡",hint:"Alguns canais não funcionam"},
  {id:"audio",label:"Sem áudio",emoji:"🔇",hint:"Imagem aparece, mas não sai som"},
  {id:"other",label:"Outro problema",emoji:"🛠️",hint:"Não encontrei meu erro"}
];
const devices:{id:Device;label:string;icon:typeof Tv2}[]=[
  {id:"smart",label:"Smart TV",icon:Tv2},
  {id:"box",label:"TV Box / Fire TV",icon:MonitorPlay},
  {id:"mobile",label:"Celular",icon:Smartphone},
  {id:"pc",label:"Computador",icon:Globe}
];
function statusInfo(s:PublicServer|null) {
  if(!s)return {label:"Servidor não selecionado",color:"text-slate-400",bg:"border-white/10 bg-slate-900/70"};
  if(s.status==="up")return {label:"Respondendo às verificações",color:"text-emerald-300",bg:"border-emerald-500/25 bg-emerald-500/10"};
  if(s.status==="down")return {label:"Indisponibilidade detectada",color:"text-red-300",bg:"border-red-500/25 bg-red-500/10"};
  if(s.status==="dns_issue")return {label:"Falha de DNS identificada",color:"text-amber-300",bg:"border-amber-500/25 bg-amber-500/10"};
  if(s.status==="unstable")return {label:"Instabilidade em análise",color:"text-amber-300",bg:"border-amber-500/25 bg-amber-500/10"};
  return {label:"Sem dados recentes conclusivos",color:"text-slate-300",bg:"border-slate-600/30 bg-slate-700/20"};
}
function triage(server:PublicServer, symptom:Symptom, device:Device, message:string) {
  const tips:string[]=[];
  let summary="";
  let headline="";
  const condition=server.status;
  if(condition==="down"){
    headline="Detectamos uma indisponibilidade do servidor";
    summary="O monitoramento registrou falha de disponibilidade. Pode ser um problema do serviço, e não do seu aparelho.";
    tips.push("Evite reinstalar aplicativos ou alterar senhas enquanto a falha persistir.","Tente novamente depois de alguns minutos e acompanhe o status atualizado.","Se precisar, envie este diagnóstico ao suporte da sua revenda.");
  }else if(condition==="dns_issue"){
    headline="O DNS do servidor apresenta problema";
    summary="As verificações de DNS indicaram falha. Isso não confirma, sozinho, que todos os conteúdos estão indisponíveis.";
    tips.push("Verifique se outros aplicativos e sites estão funcionando na mesma internet.","Aguarde a normalização do DNS e faça um novo teste.","Se o erro persistir, envie o diagnóstico ao suporte.");
  }else if(condition==="unstable"){
    headline="Detectamos sinais de instabilidade";
    summary="O monitoramento identificou uma possível falha intermitente. Ainda é necessário comparar a reprodução no seu aparelho.";
    tips.push("Teste novamente após alguns minutos.","Confira se a mesma falha acontece em outro aparelho ou conexão.");
  }else if(condition==="unknown"){
    headline="Não temos medições recentes suficientes";
    summary="O estado do servidor não pode ser confirmado no momento. Isso não significa necessariamente que ele está offline.";
    tips.push("Confira se outros sites e aplicativos estão funcionando.","Anote o horário exato do erro para informar ao suporte.");
  }else{
    headline="O servidor está respondendo aos testes";
    summary="A conectividade responde nas verificações atuais, mas isso não garante que todos os canais, filmes ou aplicativos estejam reproduzindo corretamente.";
  }
  if(symptom==="buffer"){
    tips.push("Reinicie o aplicativo e feche outras reproduções simultâneas.","Se possível, teste a TV por cabo de rede ou próximo do Wi-Fi.","Compare o mesmo conteúdo em outro aparelho ou rede.");
  }else if(symptom==="black"){
    tips.push("Teste outro canal ou vídeo autorizado e observe se aparece áudio.","Feche o aplicativo completamente e abra novamente.","Verifique se o aplicativo está atualizado e é compatível com o seu aparelho.");
  }else if(symptom==="login"){
    tips.push("Confira seus dados de acesso diretamente com o fornecedor, sem enviar senhas nesta página.","Verifique se sua assinatura está ativa e se há erros de digitação.","Reinicie o aplicativo e solicite suporte se a autenticação continuar falhando.");
  }else if(symptom==="vod"){
    tips.push("Teste outro filme ou episódio para identificar se o problema é isolado.","Feche e reabra o aplicativo.","Confira se a TV também apresenta o problema em canais ao vivo.");
  }else if(symptom==="live"){
    tips.push("Teste dois canais diferentes para verificar se a falha é geral.","Compare com um conteúdo sob demanda, se disponível.","Reinicie o aplicativo, sem alterar as configurações de acesso.");
  }else if(symptom==="audio"){
    tips.push("Confira o volume e a saída de áudio do aparelho.","Teste outro conteúdo para diferenciar falha do vídeo e do dispositivo.","Se disponível, selecione outra faixa de áudio compatível.");
  }else{
    tips.push("Anote o código da mensagem de erro e o horário.","Teste em outro dispositivo ou conexão para comparar.","Compartilhe o diagnóstico com o suporte da sua revenda.");
  }
  // Interpretação local de códigos de erro frequentes: nenhuma consulta a IA é
  // feita por visitantes anônimos e nenhuma senha precisa ser informada.
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const code = normalized.match(/(?:^|[^0-9])(401|403|404|408|429|500|502|503|504)(?![0-9])/);
  if(code) {
    const details:Record<string,{meaning:string;action:string}>={
      "401":{meaning:"Erro 401 indica falha de autenticação ou sessão inválida.",action:"Confira a validade do acesso com sua revenda. Nunca compartilhe senhas nesta página."},
      "403":{meaning:"Erro 403 indica que o recurso foi recusado, por autorização ou regras do serviço.",action:"Peça ao suporte para verificar a permissão do recurso; não tente contornar bloqueios."},
      "404":{meaning:"Erro 404 indica que o conteúdo ou endereço solicitado não foi encontrado.",action:"Confira se outros conteúdos autorizados funcionam e informe qual item falhou."},
      "408":{meaning:"Erro 408 indica tempo esgotado durante uma solicitação.",action:"Verifique a estabilidade da conexão e compare novamente em outro aparelho."},
      "429":{meaning:"Erro 429 indica excesso de requisições ao serviço.",action:"Evite repetir tentativas rapidamente; aguarde um pouco e procure o suporte se continuar."},
      "500":{meaning:"Erro 500 sugere uma falha interna no serviço.",action:"Registre o horário e envie o erro ao suporte; reinstalar o aplicativo pode não ajudar."},
      "502":{meaning:"Erro 502 indica falha de comunicação entre servidores ou intermediários.",action:"Tente novamente após alguns minutos e registre o horário da ocorrência."},
      "503":{meaning:"Erro 503 normalmente indica indisponibilidade temporária do recurso.",action:"Aguarde a normalização e evite alterar configurações de acesso."},
      "504":{meaning:"Erro 504 indica que um servidor intermediário não recebeu resposta a tempo.",action:"Anote o horário, verifique a conectividade e tente novamente sem repetir rapidamente."}
    };
    const match=details[code[1]];
    if(match){
      summary += " "+match.meaning;
      tips.unshift(match.action);
    }
  }
  if(normalized.includes("ssl")||normalized.includes("certificado")) {
    tips.unshift("Verifique se a data e a hora do aparelho estão corretas. Se o certificado do serviço falhar, informe ao suporte; não desative a segurança do aparelho.");
  }
  if(normalized.includes("dns")&&server.status!=="dns_issue") {
    tips.unshift("Um erro de DNS no aplicativo pode ter origem na rede ou no serviço. Teste outro site e registre se o problema aparece só neste aplicativo.");
  }
  if(device==="smart")tips.push("Se o aplicativo não responder, desligue a TV da tomada por 30 segundos antes de ligar novamente.");
  if(device==="box")tips.push("Confira o espaço livre do TV Box e reinicie o aparelho.");
  const text=message.trim().slice(0,180);
  return {headline,summary,tips:[...new Set(tips)].slice(0,6),
    supportText:[
      "Olá! Preciso de ajuda com meu acesso.",
      "Servidor: "+server.name,
      "Aparelho: "+(devices.find(d=>d.id===device)?.label??"Não informado"),
      "Problema: "+(symptoms.find(s=>s.id===symptom)?.label??"Outro"),
      ...(text?["Detalhes: "+text]:[]),
      "Diagnóstico inicial: "+headline,
      "Status monitorado: "+statusInfo(server).label,
      "Não informei senha nem dados privados nesta mensagem."
    ].join("\n")};
}
function normalizeWa(value:string|null) {
  const digits=(value??"").replace(/\D/g,"");
  return digits.length>=10&&digits.length<=15?digits:null;
}
function PublicResellerHelp(){
  const {slug}=Route.useParams();
  const [serverId,setServerId]=useState("");
  const [symptom,setSymptom]=useState<Symptom>("buffer");
  const [device,setDevice]=useState<Device>("smart");
  const [detail,setDetail]=useState("");
  const [step,setStep]=useState<1|2|3>(1);
  const {data:page,isLoading,isError,refetch,isFetching}=useQuery<PublicPage|null>({
    queryKey:["public-reseller-help",slug],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_public_reseller_help",{_slug:slug});
      if(error)throw error;
      return data as PublicPage|null;
    },refetchInterval:60_000,staleTime:30_000
  });
  const server=useMemo(()=>page?.servers?.find(s=>s.id===serverId)??null,[page,serverId]);
  const memory = useQuery<{solution:string;outcome:string}[]>({
    queryKey:["public-help-memory",slug,serverId,symptom],
    enabled:step===3 && !!serverId,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_public_help_resolutions",{
        _slug:slug,_server_id:serverId,_error_kind:symptom
      });
      if(error)throw error;
      return Array.isArray(data)?data:[];
    },staleTime:60000,retry:1,
  });
  const selectedStatus=statusInfo(server);
  const result=server?triage(server,symptom,device,detail):null;
  const wa=normalizeWa(page?.whatsapp??null);
  const waLink=wa&&result?"https://wa.me/"+wa+"?text="+encodeURIComponent(result.supportText):null;
  const primary=page?.primary_color&&/^#[0-9a-f]{6}$/i.test(page.primary_color)?page.primary_color:"#348dff";
  async function copy(text:string) {
    try{await navigator.clipboard.writeText(text); }catch{/** Clipboard may be disabled in some browsers. */}
  }
  return <div className="min-h-screen bg-[#071120] text-slate-100">
    <header className="border-b border-white/10 bg-[#0b182b]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          {page?.logo_url&&/^https:\/\//i.test(page.logo_url)?<img src={page.logo_url} alt="" className="h-10 w-10 rounded-xl object-contain bg-white/10"/>:<div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15"><LifeBuoy className="h-5 w-5 text-sky-300"/></div>}
          <div><p className="font-bold leading-tight">{page?.name??"Central de Ajuda"}</p><p className="text-[11px] text-slate-400">Suporte e diagnóstico</p></div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300"><ShieldCheck className="h-3.5 w-3.5"/> Consulta segura</span>
      </div>
    </header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      {isLoading?<div className="rounded-2xl border border-white/10 bg-[#111e33] p-10 text-center text-slate-300">Carregando sua central de ajuda...</div>:null}
      {isError?<div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">Não foi possível carregar a página agora. <button className="underline" onClick={()=>refetch()}>Tentar novamente</button></div>:null}
      {!isLoading&&!isError&&!page?<div className="rounded-2xl border border-white/10 bg-[#111e33] p-10 text-center">Essa central não está disponível ou foi desativada pelo revendedor.</div>:null}
      {page&&<>
        <section className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-br from-[#102c56] via-[#10213d] to-[#07182c] p-6 sm:p-10">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-400/15 blur-3xl"/>
          <div className="relative">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-sky-200"><Wrench className="h-4 w-4"/> AUTOATENDIMENTO INTELIGENTE</p>
            <h1 className="max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">Sua TV deu problema? Vamos ajudar.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">Escolha seu servidor, conte o que aconteceu e receba orientações simples. A consulta é gratuita, sem login e não pede sua senha.</p>
            {page.tagline&&<p className="mt-4 text-xs font-semibold text-sky-300">{page.tagline}</p>}
          </div>
        </section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.65fr)]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111e33]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 font-bold"><CircleHelp className="h-5 w-5 text-sky-400"/> Diagnóstico guiado</div>
              <span className="text-xs text-slate-400">Etapa {step} de 3</span>
            </div>
            <div className="p-5 sm:p-7 space-y-5">
              <div className="grid grid-cols-3 gap-2">{[1,2,3].map(i=><div key={i} className={i<=step?"h-1.5 rounded-full bg-blue-500":"h-1.5 rounded-full bg-white/10"}/>)}</div>
              {step===1&&<>
                <div><h2 className="text-xl font-bold">Qual servidor você usa?</h2><p className="mt-1 text-sm text-slate-400">Apenas os servidores disponibilizados pela sua revenda aparecem aqui.</p></div>
                {page.servers.length? <div className="space-y-2">{page.servers.map(s=><button type="button" key={s.id} onClick={()=>setServerId(s.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition ${serverId===s.id?"border-blue-400 bg-blue-500/15":"border-white/10 bg-white/[0.03] hover:border-blue-400/40"}`}>
                  <div className="min-w-0"><p className="font-semibold">{s.name}</p>{s.dns_label&&<p className="text-xs text-slate-400">{s.dns_label}</p>}</div>
                  <span className={`shrink-0 text-xs ${statusInfo(s).color}`}>{statusInfo(s).label}</span>
                </button>)}</div>:<p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">O revendedor ainda não disponibilizou servidores para atendimento.</p>}
                <button disabled={!serverId} onClick={()=>setStep(2)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white disabled:opacity-40">Continuar <ArrowRight className="h-4 w-4"/></button>
              </>}
              {step===2&&<>
                <h2 className="text-xl font-bold">O que está acontecendo?</h2>
                <div className="grid gap-2 sm:grid-cols-2">{symptoms.map(s=><button key={s.id} type="button" onClick={()=>setSymptom(s.id)} className={`rounded-xl border p-3.5 text-left transition ${symptom===s.id?"border-sky-400 bg-blue-500/15":"border-white/10 bg-white/[0.03] hover:border-blue-400/30"}`}>
                  <span className="text-lg">{s.emoji}</span><p className="mt-1 text-sm font-semibold">{s.label}</p><p className="mt-1 text-xs text-slate-400">{s.hint}</p>
                </button>)}</div>
                <div className="grid grid-cols-2 gap-2">{devices.map(d=><button key={d.id} type="button" onClick={()=>setDevice(d.id)} className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${device===d.id?"border-sky-400 bg-blue-500/15":"border-white/10"}`}><d.icon className="h-4 w-4 text-sky-300"/>{d.label}</button>)}</div>
                <label className="block space-y-2"><span className="text-sm font-semibold">Detalhes adicionais (opcional)</span><textarea maxLength={180} value={detail} onChange={e=>setDetail(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-[#0b1525] p-3 text-sm outline-none focus:border-blue-400" placeholder="Ex.: erro 403, acontece depois das 20h. Não informe senhas nem dados pessoais."/></label>
                <div className="flex gap-2"><button onClick={()=>setStep(1)} className="flex h-12 items-center gap-1 rounded-xl border border-white/15 px-4 text-sm"><ChevronLeft className="h-4 w-4"/> Voltar</button><button className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold" onClick={()=>setStep(3)}><Wrench className="h-4 w-4"/> Encontrar solução</button></div>
              </>}
              {step===3&&result&&server&&<>
                <div className={`rounded-xl border p-4 ${selectedStatus.bg}`}>
                  <p className={`flex items-center gap-2 text-sm font-semibold ${selectedStatus.color}`}><Activity className="h-4 w-4"/>{selectedStatus.label}</p>
                  <p className="mt-2 text-xs text-slate-400">Servidor: {server.name}. Dados de conectividade, não teste direto da reprodução.</p>
                </div>
                <div><h2 className="text-xl font-bold">{result.headline}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{result.summary}</p></div>
                <div className="space-y-3"><h3 className="font-bold text-sky-300">O que fazer agora</h3>{result.tips.map((tip,i)=><div key={i} className="flex items-start gap-3 rounded-xl bg-white/[0.04] p-3.5 text-sm leading-relaxed"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400"/>{tip}</div>)}</div>
                {!!memory.data?.length && <div className="space-y-2 rounded-xl border border-sky-500/25 bg-blue-500/10 p-4">
                  <h3 className="font-bold text-sky-200">Soluções de casos semelhantes</h3>
                  <p className="text-xs text-slate-400">Registros resolvidos e anonimizados, autorizados pela revenda. Podem não corresponder à causa do seu problema.</p>
                  {memory.data.map((item,i)=><p key={i} className="rounded-lg bg-white/5 p-3 text-sm">{item.solution}</p>)}
                </div>}
                <div className="flex flex-wrap gap-2"><button onClick={()=>{setStep(1);refetch();}} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm"><RefreshCw className="h-4 w-4"/> Novo diagnóstico</button><button onClick={()=>copy(result.supportText)} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm"><Copy className="h-4 w-4"/> Copiar resumo</button></div>
                {waLink&&<a target="_blank" rel="noopener noreferrer" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white" href={waLink}><MessageCircle className="h-4 w-4"/> Enviar diagnóstico ao suporte</a>}
                <p className="text-[11px] leading-relaxed text-slate-500">Esta orientação é preliminar. Se o erro persistir, procure seu revendedor. A página não realiza alterações no seu aparelho ou serviço.</p>
              </>}
            </div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#111e33] p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold"><Wifi className="h-5 w-5 text-sky-400"/> Situação dos servidores</div>
              <p className="text-xs text-slate-400">Somente os servidores disponibilizados por {page.name}.</p>
              {page.servers.slice(0,8).map(s=><div key={s.id} className="flex items-start justify-between gap-2 border-t border-white/10 py-2 text-xs"><span className="font-semibold">{s.name}</span><span className={statusInfo(s).color}>{statusInfo(s).label}</span></div>)}
              {!page.servers.length&&<p className="text-xs text-slate-500">Nenhum servidor publicado.</p>}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#111e33] p-5 space-y-2"><p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-emerald-400"/> Privacidade</p><p className="text-xs leading-relaxed text-slate-400">Não pedimos usuário, senha, IP ou dados da assinatura. A página oferece orientações baseadas em status autorizado e respostas locais, sem consumir a franquia de IA.</p></div>
            <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4"/> Atualização de status a cada minuto. Exibição sujeita à disponibilidade das verificações.</p>
          </aside>
        </div>
      </>}
    </main>
    <footer className="mx-auto max-w-5xl border-t border-white/10 px-5 py-6 text-xs text-slate-500">Suporte independente de {page?.name??"sua revenda"} · Tecnologia de monitoramento <a className="text-sky-400 underline" href="https://streammonitor.site">Stream Monitor</a></footer>
  </div>;
}
