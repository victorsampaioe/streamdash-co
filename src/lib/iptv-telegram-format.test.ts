import { describe, expect, it } from "vitest";
import { escapeTelegramHtml, formatIptvAlertMessage, type IptvNoticeItem } from "./iptv-telegram-format";

const server = {name:"SUPER PLAYON",host:"superplayon.site",hasCredentials:true};
const at = new Date("2026-11-17T12:00:00Z");

describe("Telegram IPTV — mensagens organizadas", () => {
  it("trata HTTP 403 de amostra sem afirmar queda geral", () => {
    const item:IptvNoticeItem = {
      kind:"stream_offline",severity:"warning",title:"⚠ Streams de amostra offline",
      detail:"live: HTTP 403"
    };
    const text=formatIptvAlertMessage({...server,name:"GOAT",host:"cabraorange90.top"},[item],
      {observedAt:at,mode:"html",admin:true,owner:{name:"Revenda Teste",email:"teste@example.com"}});
    expect(text).toContain("<b>ALERTA IPTV");
    expect(text).toContain("<b>Servidor:</b> GOAT");
    expect(text).toContain("TV ao vivo: HTTP 403");
    expect(text).toContain("não confirma queda geral");
    expect(text).toContain("<b>Host:</b> <code>cabraorange90.top</code>");
    expect(text).toContain("Credenciais configuradas");
    expect(text).not.toContain("credenciais ativas");
    expect(text).toContain("<b>Revenda:</b> Revenda Teste");
    expect(text).toContain("<b>E-mail:</b> teste@example.com");
    expect(text).toContain("17/11/2026");
    expect(text).not.toContain("problemas detectados");
  });
  it("mostra erro HTTP 503 como falha na amostra e não inventa diagnóstico",()=>{
    const t=formatIptvAlertMessage(server,[
      {kind:"stream_offline",severity:"warning",title:"⚠ Streams de amostra offline",detail:"live: HTTP 503"}
    ],{mode:"plain",observedAt:at});
    expect(t).toContain("HTTP 503");
    expect(t).toContain("Confirme em outras reproduções");
    expect(t).not.toContain("servidor inteiro offline");
    expect(t).not.toContain("<b>");
    expect(t).not.toContain("E-mail");
  });
  it("não chama duas atualizações de catálogo de dois problemas",()=>{
    const t=formatIptvAlertMessage({name:"Flux",host:"appbr02.sbs",hasCredentials:true},[
      {kind:"catalog_added",severity:"info",title:"🎬 Novos conteúdos no catálogo",detail:"📺 +33 canais"},
      {kind:"catalog_removed",severity:"info",title:"📉 31 conteúdo(s) removido(s) do catálogo",
       detail:"Total atual: 2900 canais · 31371 filmes · 11007 séries"}
    ],{mode:"html",observedAt:at});
    expect(t).toContain("ATUALIZAÇÃO IPTV");
    expect(t).toContain("2 ocorrências");
    expect(t).toContain("33 canais");
    expect(t).toContain("Removidos:");
    expect(t).toContain("31 conteúdos");
    expect(t).toContain("2900 canais");
    expect(t).toContain("31371 filmes");
    expect(t).toContain("11007 séries");
    expect(t).not.toContain("2 problemas");
  });
  it("avisa queda de health score sem dizer que houve indisponibilidade",()=>{
    const t=formatIptvAlertMessage({...server,name:"brtv"},[
      {kind:"health_drop",severity:"critical",title:"🚨 Seu servidor perdeu desempenho",
       detail:"Detectamos degradação antes da queda. Health Score: 67%"}
    ],{observedAt:at});
    expect(t).toContain("Health Score:");
    expect(t).toContain("67%");
    expect(t).toContain("não confirma indisponibilidade");
    expect(t).not.toContain("antes da queda");
  });
  it("separa problemas reais das novidades positivas e preserva os dados da fonte",()=>{
    const t=formatIptvAlertMessage({...server,name:"CLB"},[
      {kind:"catalog_added",severity:"info",title:"🎬 Novos conteúdos no catálogo",
       detail:"🎬 +91 filmes · 📚 +10 séries"},
      {kind:"health_drop",severity:"critical",title:"🚨 Seu servidor perdeu desempenho",
       detail:"Detectamos degradação antes da queda. Health Score: 68%"}
    ],{mode:"html",observedAt:at});
    expect(t).toContain("1 alerta • ℹ️ 1 atualização");
    expect(t).toContain("91 filmes");
    expect(t).toContain("10 séries");
    expect(t).toContain("68%");
  });
  it("protege HTML contra dados de host e revenda e não inclui e-mail no chat do cliente",()=>{
    const unusual={name:"HOST <test> & server",host:"x<example>&",hasCredentials:false};
    const item=[{kind:"api_slow",severity:"warning",title:"⚠ Player API lenta",detail:"7000ms <alert>"}];
    const admin=formatIptvAlertMessage(unusual,item,{
      admin:true,owner:{name:"<b>João & CIA</b>",email:"secret@example.com"},observedAt:at
    });
    expect(admin).toContain("HOST &lt;test&gt; &amp; server");
    expect(admin).toContain("&lt;b&gt;João &amp; CIA&lt;/b&gt;");
    expect(admin).toContain("&lt;alert&gt;");
    expect(admin).not.toContain("x<example>&");
    const reseller=formatIptvAlertMessage(unusual,item,{observedAt:at});
    expect(reseller).not.toContain("secret@example.com");
    expect(escapeTelegramHtml("<tag> &")).toBe("&lt;tag&gt; &amp;");
  });
});