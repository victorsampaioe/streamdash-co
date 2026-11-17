/**
 * Real Chrome execution for test/football-export-harness.html.
 * Unlike Chrome --dump-dom with virtual-time-budget, this waits until the
 * async canvas PNGs are fully encoded/decoded and the last pixel is tested.
 */
const targetUrl="http://127.0.0.1:4173/test/football-export-harness.html";
const debugging="http://127.0.0.1:9222";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let connection;
for(let i=0;i<100;i++){
  try{
    const info=await fetch(debugging+"/json/version").then(r=>r.json());
    if(info.webSocketDebuggerUrl){connection=true;break;}
  }catch{/* Chrome starts asynchronously */}
  await sleep(300);
}
if(!connection)throw new Error("Chrome DevTools não iniciou na porta 9222.");
const target=await fetch(debugging+"/json/new?"+encodeURIComponent(targetUrl),{method:"PUT"}).then(r=>r.json());
if(!target.webSocketDebuggerUrl)throw new Error("Chrome não criou a aba de teste.");
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{
  ws.addEventListener("open",resolve,{once:true});
  ws.addEventListener("error",reject,{once:true});
});
let id=0;
const pending=new Map();
const exceptions=[];
ws.addEventListener("message",event=>{
  let msg;
  try{msg=JSON.parse(event.data)}catch{return}
  if(msg.method==="Runtime.exceptionThrown"){
    exceptions.push(msg.params?.exceptionDetails?.text||"Runtime exception");
  }
  const entry=pending.get(msg.id);
  if(entry){
    pending.delete(msg.id);
    if(msg.error)entry.reject(new Error(msg.error.message||JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
  }
});
function command(method,params={}){
  const seq=++id;
  return new Promise((resolve,reject)=>{
    pending.set(seq,{resolve,reject});
    ws.send(JSON.stringify({id:seq,method,params}));
  });
}
try{
  await command("Runtime.enable");
  await command("Page.enable");
  const expiry=Date.now()+120_000;
  let last={status:"waiting",url:""};
  while(Date.now()<expiry){
    try{
      const result=await command("Runtime.evaluate",{
        expression:"({url:location.href,status:document.querySelector('#results')?.dataset.status||'absent',text:document.querySelector('#results')?.textContent?.slice(0,12000)||''})",
        returnByValue:true,
      });
      last=result.result?.value||last;
    }catch{/* navigation can temporarily invalidate the runtime */}
    if(last.status==="pass"){
      console.log(last.text);
      console.log("CHROME_VERIFIED_REAL_PNG_PIXELS=true");
      process.exitCode=0;
      break;
    }
    if(last.status==="fail"){
      throw new Error("Validação real falhou: "+last.text);
    }
    await sleep(750);
  }
  if(last.status!=="pass"){
    throw new Error("Chrome terminou sem confirmar PNG: "+JSON.stringify(last)+
      "; exceções="+exceptions.join(" | "));
  }
}finally{
  ws.close();
}
