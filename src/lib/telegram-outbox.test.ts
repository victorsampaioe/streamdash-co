import { describe, expect, it } from "vitest";
import { isPermanentTelegramError, nextBackoffSeconds, outboxKey } from "./telegram-outbox";

describe("Telegram Delivery Guard", () => {
  it("backoff cresce e respeita teto de 1h", () => {
    expect(nextBackoffSeconds(1)).toBe(30);
    expect(nextBackoffSeconds(3)).toBe(300);
    expect(nextBackoffSeconds(50)).toBe(3600);
  });
  it("usa retry_after do Telegram (429) quando maior", () => {
    expect(nextBackoffSeconds(1, 90)).toBe(90);
  });
  it("erros 400/403 vão para dead letter; 429/500 tentam de novo", () => {
    expect(isPermanentTelegramError(403)).toBe(true);
    expect(isPermanentTelegramError(400)).toBe(true);
    expect(isPermanentTelegramError(429)).toBe(false);
    expect(isPermanentTelegramError(500)).toBe(false);
  });
  it("mesma mensagem para o mesmo destino gera a mesma chave (sem duplicar)", async () => {
    expect(await outboxKey("1", "a")).toBe(await outboxKey("1", "a"));
    expect(await outboxKey("1", "a")).not.toBe(await outboxKey("2", "a"));
  });
});
