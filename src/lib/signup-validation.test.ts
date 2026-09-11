import { describe, expect, it } from "vitest";
import { validatePassword, validateUsername } from "./signup-validation";

describe("signup validation", () => {
  it("normalizes and accepts a simple username", () => {
    expect(validateUsername(" Cliente_4821 ")).toEqual({ ok: true, value: "cliente_4821" });
  });

  it("rejects unsafe usernames", () => {
    expect(validateUsername("cliente.com").ok).toBe(false);
    expect(validateUsername("12").ok).toBe(false);
  });

  it("returns a friendly password rule", () => {
    expect(validatePassword("123")).toEqual({ ok: false, error: "Sua senha precisa ter pelo menos 6 caracteres." });
  });
});