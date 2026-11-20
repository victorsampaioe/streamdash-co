import {describe,it,expect} from "vitest";
// @ts-expect-error Cloudflare Worker source lives outside the TS application.
import paymentWorker from "../../cloudflare/asaas-ativacoes-nova-conta/worker.js";

const worker=paymentWorker as {fetch:(request:Request,env:Record<string,unknown>,ctx?:unknown)=>Promise<Response>};
const endpoint="https://pagamentos.streammonitor.site";

describe("Pix de aplicativos — proteções de produção",()=>{
  it("não expõe detalhes financeiros no health",async()=>{
    const res=await worker.fetch(new Request(endpoint+"/health"),{});
    const body=await res.json() as Record<string,unknown>;
    expect(res.status).toBe(200);
    expect(body).toEqual({status:"ok"});
    expect(JSON.stringify(body)).not.toContain("API");
  });
  it("rejeita origem fora do Stream Monitor",async()=>{
    const res=await worker.fetch(new Request(endpoint+"/v1/pix/create",{
      method:"POST",headers:{"origin":"https://exemplo-invalido.test","content-type":"application/json"},
      body:"{}"}),{});
    expect(res.status).toBe(403);
  });
  it("rejeita emissão de Pix sem usuário autenticado",async()=>{
    const res=await worker.fetch(new Request(endpoint+"/v1/pix/create",{
      method:"POST",headers:{"origin":"https://streammonitor.site","content-type":"application/json"},
      body:"{}"}),{});
    const data=await res.json() as Record<string,unknown>;
    expect(res.status).toBe(401);
    expect(JSON.stringify(data)).not.toContain("api.asaas");
  });
  it("não aceita webhook sem token",async()=>{
    const res=await worker.fetch(new Request(endpoint+"/eventos/pagamentos",{
      method:"POST",body:JSON.stringify({id:"evt_fake",event:"PAYMENT_RECEIVED"})}),{});
    expect(res.status).toBe(503);
  });
  it("nega preflight para origens arbitrárias",async()=>{
    const res=await worker.fetch(new Request(endpoint+"/v1/pix/create",{
      method:"OPTIONS",headers:{"origin":"https://fraude.test"}}),{});
    expect(res.status).toBe(403);
  });
});
