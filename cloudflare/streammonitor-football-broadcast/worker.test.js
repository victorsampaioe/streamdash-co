import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./worker.js";

const date="2026-11-17";
const one={id:"fixture-1",home:"Flamengo",away:"Palmeiras",date};
const two={id:"fixture-2",home:"Grêmio",away:"Botafogo",date};
const three={id:"fixture-3",home:"Ceará",away:"Sport",date};
const rss=(title,link)=>`<?xml version="1.0"?><rss><channel><item>
<title>${title}</title><description>Confira os jogos.</description>
<pubDate>Tue, 17 Nov 2026 12:00:00 GMT</pubDate><link>${link}</link>
</item></channel></rss>`;

afterEach(()=>{vi.restoreAllMocks();});

describe("Cloudflare pesquisa transmissões por confronto",()=>{
  it("pesquisa em lote, recupera canais de agenda e preserva cache",async()=>{
    const kv=new Map();
    const ai={run:vi.fn(async()=>({
      choices:[{message:{content:JSON.stringify({results:[
        {id:one.id,channels:["Globo","Premiere"]},
        {id:two.id,channels:["SporTV"]},
        {id:three.id,channels:["ESPN"]}
      ]})}}]
    }))};
    const publisher="https://www.lance.com.br/futebol/agenda.html";
    const mock=vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes("/auth/v1/user"))return Response.json({id:"account-1"});
      if(url.includes("/rest/v1/rpc/has_role"))return Response.json(true);
      if(url.includes("lance.com.br")){
        return new Response("<html><body><p>Flamengo x Palmeiras: transmissão na Globo e no Premiere.</p><p>Grêmio x Botafogo: transmissão na SporTV.</p></body></html>",
          {headers:{"content-type":"text/html"}});
      }
      if(url.includes("bing.com")||url.includes("news.google.com")){
        return new Response(rss("Jogos de hoje: onde assistir futebol ao vivo",publisher),
          {headers:{"content-type":"application/rss+xml"}});
      }
      throw new Error("External URL not mocked: "+url);
    });
    vi.stubGlobal("fetch",mock);
    const env={AI:ai,VERIFIED_BROADCASTS:{
      get:vi.fn(async key=>kv.get(key)||null),
      put:vi.fn(async(key,value)=>{kv.set(key,JSON.parse(value));})
    }};
    const request=()=>new Request("https://worker.example/broadcasts",{
      method:"POST",headers:{authorization:"Bearer mock-user-session",
        apikey:"sb_publishable_01234567890123456789","content-type":"application/json"},
      body:JSON.stringify({matches:[one,two,three]})
    });
    const first=await worker.fetch(request(),env);
    const result=await first.json();
    expect(first.status).toBe(200);
    expect(result.results.find(r=>r.id===one.id)?.channels).toEqual(["Globo","Premiere"]);
    expect(result.results.find(r=>r.id===two.id)?.channels).toEqual(["SporTV"]);
    expect(result.results.find(r=>r.id===three.id)?.channels).toEqual([]);
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(kv.size).toBe(3);
    const again=await worker.fetch(request(),env);
    expect(again.status).toBe(200);
    expect(ai.run).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it("retorna canais confirmados do cache KV para cada jogo, sem pesquisa ou IA",async()=>{
    const lineup=[
      {id:"1",home:"Irlanda",away:"Kosovo",date},
      {id:"2",home:"Polônia",away:"Suécia",date},
      {id:"3",home:"País de Gales",away:"Portugal",date},
      {id:"4",home:"Singapura",away:"Brasil",date},
    ];
    const normalized=value=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const kv=new Map(lineup.map((m,index)=>[
      "v3:"+date+":"+[normalized(m.home),normalized(m.away)].sort().join(":"),
      {channels:[["Disney+"],["SporTV 2"],["SporTV"],["Globo","SporTV","ge tv"]][index],
        provider:"Fontes verificadas",sourceCount:2}
    ]));
    const model={run:vi.fn()};
    vi.stubGlobal("fetch",vi.fn(async(input)=>{
      const u=String(input);
      if(u.includes("/auth/v1/user"))return Response.json({id:"test-account"});
      if(u.includes("/rest/v1/rpc/has_role"))return Response.json(true);
      throw new Error("Não deve fazer pesquisa para canais já confirmados: "+u);
    }));
    const response=await worker.fetch(new Request("https://worker.example/broadcasts",{
      method:"POST",headers:{authorization:"Bearer authenticated-test",
        apikey:"sb_publishable_01234567890123456789","content-type":"application/json"},
      body:JSON.stringify({matches:lineup})
    }),{AI:model,VERIFIED_BROADCASTS:{get:async key=>kv.get(key)||null}});
    expect(response.status).toBe(200);
    const payload=await response.json();
    expect(payload.results.map(item=>item.channels)).toEqual([
      ["Disney+"],["SporTV 2"],["SporTV"],["Globo","SporTV","ge tv"]
    ]);
    expect(model.run).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("não permite consulta sem autenticação",async()=>{
    const result=await worker.fetch(new Request("https://worker.example/broadcasts",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({matches:[one]})
    }),{});
    expect(result.status).toBe(401);
  });
});
