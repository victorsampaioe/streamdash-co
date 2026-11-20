import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/telegram-commands.server", () => ({ resolveUserByChatId: vi.fn(async () => ({ id: "u" })), esc: (s: string) => s }));
import { activationLooseTextReply, looksLikeMacAttempt, reviewActivationMacReply, activationBotCallback, MAC_FORCE_REPLY } from "./telegram-activations.server";
import { normalizeActivationMac } from "./activation-mac";

const app = { id: "abe_player", name: "ABE PLAYER", module: null, priceCents: 1500 };
globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ app }), { status: 200 })) as any;

describe("telegram activation MAC flow", () => {
  it("rejects MAC with non-hex H", () => {
    expect(normalizeActivationMac("24:FC:36:HE:64:74")).toBeNull();
    expect(looksLikeMacAttempt("24:FC:36:HE:64:74")).toBe(true);
    expect(activationLooseTextReply("24:FC:36:HE:64:74").text).toContain("0-9");
  });
  it("loose text never returns link code", () => {
    for (const t of ["24:FC:E5:0B:03:36", "oi tudo bem"]) {
      const r = activationLooseTextReply(t).text;
      expect(r).not.toContain("vinculação");
      expect(r).toContain("/ativacaoAplicativo");
    }
  });
  it("selection asks MAC via ForceReply", async () => {
    const r = await activationBotCallback(123456, "aa:app:abe_player");
    expect(r.keyboard).toEqual(MAC_FORCE_REPLY);
    // selective=false is required: the selection message mentions nobody and
    // replies to nothing, so a selective prompt would not open the Reply UI.
    expect(MAC_FORCE_REPLY.selective).toBe(false);
    expect(r.text).toContain("APP-ID: abe_player");
  });
  it("valid reply MAC gets confirmation; invalid rejected", async () => {
    const ok = await reviewActivationMacReply(123456, "24fce50b0336", "APP-ID: abe_player");
    expect(ok?.text).toContain("MAC: 24:FC:E5:0B:03:36");
    const bad = await reviewActivationMacReply(123456, "24:FC:36:HE:64:74", "APP-ID: abe_player");
    expect(bad?.text).toContain("MAC inválido");
    expect(await reviewActivationMacReply(123456, "24fce50b0336", "outra mensagem")).toBeNull();
  });
  it("confirm callback links to site and keeps app/MAC", async () => {
    const r = await activationBotCallback(123456, "aa:confirm:abe_player", "APP-ID: abe_player\nMAC: 24:FC:E5:0B:03:36");
    expect(r.text).toContain("24:FC:E5:0B:03:36");
    expect(JSON.stringify(r.keyboard)).toContain("streammonitor.site/app/ativacao-aplicativos");
  });
});
