/** Each HTMLMediaElement accepts createMediaElementSource() at most once
 * for its entire lifetime—even if its previous AudioContext was closed.
 * Keep the source/context attached to the element and reconnect a fresh
 * MediaStreamDestination for each MP4 export or retry.
 */
type VideoAudioGraph={
  context:AudioContext;
  source:MediaElementAudioSourceNode;
};
const videoAudioGraphs=new WeakMap<HTMLVideoElement,VideoAudioGraph>();

export function getOrCreateVideoAudioGraph(
  video:HTMLVideoElement,
  createContext:()=>AudioContext=()=>new AudioContext(),
):VideoAudioGraph{
  const existing=videoAudioGraphs.get(video);
  if(existing){
    if(existing.context.state==="closed"){
      throw new Error("O áudio deste vídeo foi encerrado. Atualize a página para tentar novamente.");
    }
    return existing;
  }
  const context=createContext();
  try{
    const source=context.createMediaElementSource(video);
    const graph={context,source};
    videoAudioGraphs.set(video,graph);
    return graph;
  }catch(error){
    // Never close a context for an element whose source may have been
    // created: browsers permanently bind a MediaElementSourceNode to it.
    void context.suspend().catch(()=>{});
    if(error instanceof DOMException && error.name==="InvalidStateError")
      throw new Error("Este vídeo já estava conectado a outro áudio. Atualize a página e tente novamente.");
    throw error;
  }
}
export async function connectVideoAudioToStream(
  video:HTMLVideoElement,stream:MediaStream,
):Promise<()=>void>{
  const graph=getOrCreateVideoAudioGraph(video);
  const destination=graph.context.createMediaStreamDestination();
  const tracks=destination.stream.getAudioTracks();
  if(tracks.length===0)throw new Error("Este navegador não permite capturar o áudio do vídeo.");
  // A previous export can leave source connections behind. Disconnecting
  // the old output is safe; the MediaElementSourceNode itself is reusable.
  graph.source.disconnect();
  graph.source.connect(destination);
  tracks.forEach(track=>stream.addTrack(track));
  video.muted=false;
  try{
    await graph.context.resume();
  }catch(error){
    graph.source.disconnect();
    throw new Error("Não foi possível iniciar o áudio do vídeo. Toque em Gerar novamente.");
  }
  let released=false;
  return ()=>{
    if(released)return;
    released=true;
    graph.source.disconnect();
    // Keep AudioContext and MediaElementSourceNode alive for a second export
    // with the SAME element; closing would make retries fail permanently.
    if(graph.context.state==="running")void graph.context.suspend().catch(()=>{});
  };
}
export function disposeVideoAudioGraph(video:HTMLVideoElement){
  const graph=videoAudioGraphs.get(video);
  if(!graph)return;
  videoAudioGraphs.delete(video);
  try{graph.source.disconnect();}catch{/*element already detached*/}
  if(graph.context.state!=="closed")void graph.context.close().catch(()=>{});
  // Only call when the video is permanently removed, never for a retry.
}
