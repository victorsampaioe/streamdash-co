import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Link} from "@tanstack/react-router";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {toast} from "sonner";
import {Trash2,Upload,RefreshCw,Video,Eye,EyeOff} from "lucide-react";
import {
 listVideoModels,registerVideoModel,removeVideoModel,updateVideoModel
} from "@/lib/vitrine-video-models.functions";
import {uploadAdminVideoTemplate,validateVideoTemplateFile} from "@/lib/vitrine-video-template-upload";

async function inspectVideo(file:File){
  const src=URL.createObjectURL(file);
  try{
    const video=document.createElement("video");
    video.preload="metadata";video.src=src;
    const result=await new Promise<{seconds:number;width:number;height:number}>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("O navegador não conseguiu ler o MP4.")),12000);
      video.onloadedmetadata=()=>{
        clearTimeout(timer);
        const seconds=Math.max(1,Math.round(video.duration));
        const ratio=video.videoWidth/video.videoHeight;
        if(!Number.isFinite(video.duration)||video.duration<1||video.duration>120.05||video.videoWidth<128)
          reject(new Error("O MP4 deve durar até 120 segundos e ter vídeo válido."));
        else if(ratio<.47||ratio>.70)
          reject(new Error("Envie um vídeo vertical (formato Story, como o exemplo)."));
        else resolve({seconds,width:video.videoWidth,height:video.videoHeight});
      };
      video.onerror=()=>{clearTimeout(timer);reject(new Error("Este MP4 não pode ser reproduzido."));};
    });
    video.removeAttribute("src");video.load();
    return result;
  }finally{URL.revokeObjectURL(src);}
}

export function AdminVideoTemplatePanel(){
  const qc=useQueryClient();
  const list=useServerFn(listVideoModels);
  const register=useServerFn(registerVideoModel);
  const toggle=useServerFn(updateVideoModel);
  const remove=useServerFn(removeVideoModel);
  const templates=useQuery({queryKey:["video-template-catalog"],queryFn:()=>list(),staleTime:0});
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState("");
  const [previewUrl,setPreviewUrl]=useState("");
  const toggleMutation=useMutation({
    mutationFn:(args:{id:string;active:boolean})=>toggle({data:args}),
    onSuccess:()=>{void qc.invalidateQueries({queryKey:["video-template-catalog"]});toast.success("Modelo atualizado");},
    onError:(err:Error)=>toast.error(err.message)
  });
  const removeMutation=useMutation({
    mutationFn:(id:string)=>remove({data:{id}}),
    onSuccess:()=>{void qc.invalidateQueries({queryKey:["video-template-catalog"]});toast.success("Vídeo removido");},
    onError:(err:Error)=>toast.error(err.message)
  });
  async function submit(){
    if(!file||busy)return;
    setError("");setBusy(true);setProgress(0);
    try{
      validateVideoTemplateFile(file);
      if(title.trim().length<2)throw new Error("Informe um título para o vídeo.");
      const info=await inspectVideo(file);
      const path=await uploadAdminVideoTemplate(file,setProgress);
      await register({data:{title:title.trim(),description:description.trim(),
        path,seconds:info.seconds,width:info.width,height:info.height,bytes:file.size}});
      toast.success("Vídeo cadastrado para as revendas!");
      setTitle("");setDescription("");setFile(null);setProgress(0);
      await qc.invalidateQueries({queryKey:["video-template-catalog"]});
    }catch(err){
      const message=err instanceof Error?err.message:"Não foi possível salvar o modelo.";
      setError(message);toast.error(message);
    }finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-6xl space-y-6 p-4 text-white sm:p-7">
    <header className="rounded-2xl border border-blue-400/30 bg-[#081932] p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-300">Administração · Stream Monitor</p>
      <h1 className="mt-2 text-3xl font-black">Biblioteca de vídeos para revendas</h1>
      <p className="mt-2 text-sm text-slate-300">
        Cadastre vídeos verticais MP4 como o modelo enviado. Cada revenda poderá
        gerar uma versão personalizada com a própria logo e WhatsApp.
        Você controla quais vídeos aparecem na biblioteca.
      </p>
      <Link to="/vitrine-video-modelos"
        className="mt-3 inline-block text-sm font-semibold text-blue-300 underline">
        Abrir a biblioteca do revendedor
      </Link>
    </header>
    <Card className="space-y-4 border-blue-400/30 p-5">
      <h2 className="text-lg font-bold">Adicionar vídeo MP4</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Título do vídeo
          <Input value={title} onChange={e=>setTitle(e.target.value)}
            maxLength={100} placeholder="Ex.: Novidade da semana" className="mt-1"/>
        </label>
        <label className="text-sm">Descrição (opcional)
          <Input value={description} onChange={e=>setDescription(e.target.value)}
            maxLength={350} placeholder="Ex.: Vídeo promocional vertical" className="mt-1"/>
        </label>
      </div>
      <label className="block text-sm">Selecione o vídeo
        <Input type="file" accept=".mp4,video/mp4" className="mt-1"
          onChange={e=>{
            const input=e.target.files?.[0]||null;
            setError("");
            if(input){try{validateVideoTemplateFile(input);}catch(err){
              setError(err instanceof Error?err.message:"MP4 inválido");setFile(null);return;
            }}
            setFile(input);
          }}/>
      </label>
      <p className="text-xs text-muted-foreground">
        MP4 até 100 MB e 120 segundos. Para vídeos maiores que 6 MB,
        o upload utiliza transferência resumível. Cadastre apenas vídeos
        próprios ou com autorização de divulgação.
      </p>
      {file&&<p className="text-sm text-blue-500">{file.name} · {(file.size/1048576).toFixed(1)} MB</p>}
      {error&&<p className="text-sm text-red-500" role="alert">{error}</p>}
      {busy&&<div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-blue-500" style={{width:Math.round(progress*100)+"%"}}/>
        </div>
        <p className="mt-2 text-xs">{Math.round(progress*100)}% enviado</p>
      </div>}
      <Button onClick={()=>void submit()} disabled={busy||!file||!title.trim()||!!error}>
        {busy?<RefreshCw className="mr-2 h-4 w-4 animate-spin"/>:<Upload className="mr-2 h-4 w-4"/>}
        {busy?"Salvando MP4...":"Publicar vídeo na biblioteca"}
      </Button>
    </Card>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Vídeos cadastrados</h2>
        <Button variant="outline" onClick={()=>void templates.refetch()} size="sm">
          <RefreshCw className="mr-2 h-4 w-4"/> Atualizar
        </Button>
      </div>
      {templates.isLoading?<Card className="p-5">Consultando modelos...</Card>:
        templates.isError?<Card className="p-5 text-red-500">Não foi possível consultar a biblioteca.</Card>:
        templates.data?.models.length===0?<Card className="p-5">Ainda não há vídeos cadastrados.</Card>:
        <div className="grid gap-4 md:grid-cols-2">
          {templates.data?.models.map(model=><Card key={model.id}
            className="space-y-3 border-blue-500/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">{model.title}</h3>
              <span className={model.active?"text-xs text-green-600":"text-xs text-muted-foreground"}>
                {model.active?"Publicado":"Oculto"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{model.description}</p>
            <p className="text-xs text-muted-foreground">
              {model.duration_seconds}s · {model.width}×{model.height} · {(model.size_bytes/1048576).toFixed(1)} MB
            </p>
            <video controls playsInline preload="metadata" src={model.video_url}
              className="mx-auto max-h-56 rounded-lg bg-black"/>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={toggleMutation.isPending}
                onClick={()=>toggleMutation.mutate({id:model.id,active:!model.active})}>
                {model.active?<EyeOff className="mr-2 h-4 w-4"/>:<Eye className="mr-2 h-4 w-4"/>}
                {model.active?"Ocultar":"Liberar"}
              </Button>
              <Button size="sm" variant="destructive" disabled={removeMutation.isPending}
                onClick={()=>{
                  if(window.confirm("Excluir definitivamente este vídeo do catálogo?"))
                    removeMutation.mutate(model.id);
                }}>
                <Trash2 className="mr-2 h-4 w-4"/> Excluir
              </Button>
            </div>
          </Card>)}
        </div>}
    </section>
  </main>;
}
