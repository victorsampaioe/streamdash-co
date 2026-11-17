import {describe,it,expect} from "vitest";
import {isAllowedPosterImageUrl} from "./vitrine-football-export.functions";

describe("Segurança das imagens no PNG da Vitrine Futebol",()=>{
  it("permite imagens de escudos FTWB e logo armazenada em Supabase",()=>{
    expect(isAllowedPosterImageUrl("https://ftwb.notiffly.com.br/static/teams/a.png")).toBe(true);
    expect(isAllowedPosterImageUrl("https://flagcdn.com/w80/br.png")).toBe(true);
    expect(isAllowedPosterImageUrl("https://yiwyfiaqehhmngqngxvx.supabase.co/storage/v1/object/public/logos/logo.png")).toBe(true);
  });
  it("bloqueia acesso a rede interna e URLs arbitrárias",()=>{
    expect(isAllowedPosterImageUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isAllowedPosterImageUrl("https://127.0.0.1/image.png")).toBe(false);
    expect(isAllowedPosterImageUrl("https://example.com/secret")).toBe(false);
    expect(isAllowedPosterImageUrl("https://ftwb.notiffly.com.br.evil.net/a.png")).toBe(false);
    expect(isAllowedPosterImageUrl("https://flagcdn.com:8443/image.png")).toBe(false);
  });
});