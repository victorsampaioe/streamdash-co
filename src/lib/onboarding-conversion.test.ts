import {describe,expect,it} from "vitest";
import {CONVERSION_REMINDER_MESSAGES,getConversionReminderStep} from "./onboarding-conversion";

describe("5 lembretes opcionais de ativação no próprio painel",()=>{
 const t=Date.parse("2026-11-18T08:00:00Z");
 const start="2026-11-18T08:00:00Z";
 it("não mostra lembrete antes da primeira hora",()=>{
   expect(getConversionReminderStep(start,t)).toBeNull();
   expect(getConversionReminderStep(start,t+59*60_000)).toBeNull();
 });
 it("mostra somente uma mensagem em cada janela horária, no máximo cinco",()=>{
   for(let hour=1;hour<=5;hour++){
     expect(getConversionReminderStep(start,t+hour*60*60_000)).toBe(hour);
     expect(getConversionReminderStep(start,t+hour*60*60_000+59*60_000)).toBe(hour);
   }
 });
 it("não faz disparos atrasados em massa depois de seis horas",()=>{
   expect(getConversionReminderStep(start,t+6*60*60_000)).toBeNull();
   expect(getConversionReminderStep(start,t+24*60*60_000)).toBeNull();
 });
 it("não ativa com horário de cadastro incorreto",()=>{
   expect(getConversionReminderStep("invalid",t)).toBeNull();
   expect(getConversionReminderStep(start,Number.NaN)).toBeNull();
 });
 it("contém cinco abordagens distintas e sem prometer lucro",()=>{
   expect(CONVERSION_REMINDER_MESSAGES).toHaveLength(5);
   expect(new Set(CONVERSION_REMINDER_MESSAGES.map(m=>m.title)).size).toBe(5);
   expect(CONVERSION_REMINDER_MESSAGES[3].message).toContain("R$ 60");
   expect(CONVERSION_REMINDER_MESSAGES[4].message).toContain("Sem promessas de lucro");
 });
});
