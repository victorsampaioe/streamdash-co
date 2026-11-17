import {describe,expect,it} from "vitest";
import {
  isFinishedFootballStatus,parseFootballFinalScore,matchFinalScore,
  isVerifiedFinishedFootballMatch,preferFootballFixture
} from "./vitrine-football-results";
describe("placar oficial FTWB, sem invenções",()=>{
  it("aceita estados encerrados em português e inglês",()=>{
    for(const status of ["encerrado","Encerrada","FINALIZADO","Concluído","FT","full_time","finished","after extra time"])
      expect(isFinishedFootballStatus(status)).toBe(true);
    for(const status of ["ao_vivo","intervalo","1T","2T","agendado","adiado","cancelado","sem_inicio",""])
      expect(isFinishedFootballStatus(status)).toBe(false);
  });
  it("somente aceita placares numéricos plausíveis",()=>{
    expect(parseFootballFinalScore("2 × 1")).toEqual({home:2,away:1,label:"2 × 1"});
    expect(parseFootballFinalScore("0-0")).toEqual({home:0,away:0,label:"0 × 0"});
    expect(matchFinalScore(3,0,undefined)).toEqual({home:3,away:0,label:"3 × 0"});
    expect(matchFinalScore(null,null,"1 x 2")?.label).toBe("1 × 2");
    for(const value of ["2 - ","1:2 (pênaltis 4x3)","999x0","TBD", "", "não informado", "FT 2-1"])
      expect(parseFootballFinalScore(value)).toBeNull();
  });
  it("exige tanto status encerrado quanto placar de ambos lados",()=>{
    expect(isVerifiedFinishedFootballMatch({status:"ao_vivo",scoreLabel:"1 × 0"})).toBe(false);
    expect(isVerifiedFinishedFootballMatch({status:"encerrado",scoreLabel:""})).toBe(false);
    expect(isVerifiedFinishedFootballMatch({status:"encerrado",scoreLabel:"0 × 0"})).toBe(true);
  });
  it("preserva placar final confirmado e escudos completos ao mesclar fontes",()=>{
    const old={status:"agendado",scoreLabel:"",homeBadge:"home.png",
      awayBadge:"away.png",broadcasts:["Globo","SporTV"],time:"18:00",playerPhoto:""};
    const finished={status:"encerrado",scoreLabel:"3 × 2",homeBadge:"",
      awayBadge:"",broadcasts:[],time:"18:00",playerPhoto:""};
    expect(preferFootballFixture(old,finished)).toEqual({
      ...finished,homeBadge:"home.png",awayBadge:"away.png",
      broadcasts:["Globo","SporTV"],playerPhoto:""
    });
    expect(preferFootballFixture(finished,old).scoreLabel).toBe("3 × 2");
  });
});
