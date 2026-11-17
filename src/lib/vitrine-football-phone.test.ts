import { describe, expect, it } from "vitest";
import { formatBrazilianWhatsApp } from "./vitrine-football-phone";
describe("Vitrine Futebol — WhatsApp personalizado",()=>{
  it.each([
    ["85998545009","(85) 99854-5009"],
    ["+55 85 99854-5009","(85) 99854-5009"],
    ["(85) 99854-5009","(85) 99854-5009"],
    ["5585998545009","(85) 99854-5009"],
    ["8532545009","(85) 3254-5009"],
  ])("formata %s sem trocar o número", (raw,expected)=>{
    expect(formatBrazilianWhatsApp(raw)).toBe(expected);
  });
  it("não inventa DDD para telefone incompleto",()=>{
    expect(formatBrazilianWhatsApp("99854-5009")).toBe("99854-5009");
    expect(formatBrazilianWhatsApp("")).toBe("");
  });
});
