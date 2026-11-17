import {supabase} from "@/integrations/supabase/client";
const BUCKET="vitrine-video-modelos";
const CHUNK_SIZE=6*1024*1024;
const UPLOAD_TIMEOUT=75_000;

export function validateVideoTemplateFile(file:Pick<File,"name"|"size"|"type">){
  if(!/\.mp4$/i.test(file.name) || !["video/mp4","application/mp4",""].includes(file.type))
    throw new Error("Envie somente vídeos MP4.");
  if(file.size<1024||file.size>100*1024*1024)
    throw new Error("O vídeo deve ter até 100 MB.");
}
export function tusMetadata(entries:Record<string,string>){
  return Object.entries(entries).map(([key,value])=>
    key+" "+btoa(value)).join(",");
}
async function mustBeOnline(response:Response,context:string){
  if(response.ok)return;
  if(response.status===413)throw new Error("Arquivo muito grande para este armazenamento.");
  if([401,403].includes(response.status))
    throw new Error("Sem autorização para cadastrar vídeos. Entre novamente como administrador.");
  if(response.status===409)throw new Error("Este vídeo já foi enviado. Escolha outro.");
  throw new Error(context+" (HTTP "+response.status+").");
}
export async function uploadAdminVideoTemplate(
  file:File,onProgress:(fraction:number)=>void,signal?:AbortSignal
):Promise<string>{
  validateVideoTemplateFile(file);
  const {data:{session},error}=await supabase.auth.getSession();
  if(error||!session?.access_token)throw new Error("A sessão expirou. Entre novamente.");
  const projectUrl=String(import.meta.env.VITE_SUPABASE_URL||"").replace(/\/$/,"");
  const publishableKey=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||"");
  if(!/^https:\/\//i.test(projectUrl)||!publishableKey)
    throw new Error("O armazenamento ainda não está configurado.");
  const path="templates/"+crypto.randomUUID()+".mp4";
  const base=new URL(projectUrl+"/storage/v1/upload/resumable");
  const auth={
    Authorization:"Bearer "+session.access_token,
    apikey:publishableKey,
    "Tus-Resumable":"1.0.0",
  };
  const create=await fetch(base,{
    method:"POST",
    headers:{
      ...auth,"Upload-Length":String(file.size),
      "Upload-Metadata":tusMetadata({
        bucketName:BUCKET,objectName:path,contentType:"video/mp4",
        cacheControl:"3600"
      }),
      "x-upsert":"false"
    },
    signal
  });
  await mustBeOnline(create,"Não foi possível iniciar o envio");
  if(create.status!==201)throw new Error("O servidor não iniciou o envio resumível.");
  const location=create.headers.get("location");
  if(!location)throw new Error("O servidor não informou o endereço do upload.");
  const uploadUrl=new URL(location,base);
  // Never forward an administrator JWT to an unrelated Supabase tenant.
  const authorizedHost=new URL(projectUrl).hostname;
  const storageHost=authorizedHost.replace(/\.supabase\.co$/,".storage.supabase.co");
  if(uploadUrl.protocol!=="https:" ||
    ![authorizedHost,storageHost].includes(uploadUrl.hostname))
    throw new Error("Destino de upload não reconhecido.");
  let offset=0,attempts=0;
  while(offset<file.size){
    if(signal?.aborted)throw new Error("Upload cancelado.");
    const end=Math.min(file.size,offset+CHUNK_SIZE);
    try{
      const patch=await fetch(uploadUrl,{
        method:"PATCH",
        headers:{...auth,
          "Content-Type":"application/offset+octet-stream",
          "Upload-Offset":String(offset)
        },
        body:file.slice(offset,end),
        signal
      });
      if(!patch.ok){await mustBeOnline(patch,"Falha ao transferir o vídeo");}
      if(patch.status!==204)throw new Error("O servidor não confirmou o trecho enviado.");
      const reported=Number(patch.headers.get("Upload-Offset"));
      if(!Number.isSafeInteger(reported)||reported<=offset||reported>end)
        throw new Error("O servidor retornou posição inválida do upload.");
      offset=reported;attempts=0;onProgress(offset/file.size);
    }catch(err){
      if(signal?.aborted)throw err;
      if(++attempts>3)throw err;
      // Recover upload progress from server before repeating a chunk.
      const check=await fetch(uploadUrl,{method:"HEAD",headers:auth,signal});
      await mustBeOnline(check,"Não foi possível retomar o upload");
      const next=Number(check.headers.get("Upload-Offset"));
      if(!Number.isSafeInteger(next)||next<0||next>file.size)
        throw new Error("O upload não pode ser retomado.");
      offset=next;onProgress(offset/file.size);
    }
  }
  onProgress(1);
  return path;
}
