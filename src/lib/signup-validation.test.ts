import { describe, expect, it } from "vitest";
import { normalizeUsername, validatePassword, validateUsername } from "./signup-validation";

describe("signup validation", () => {
  it("normalizes and accepts a simple username", () => {
    expect(validateUsername(" Cliente_4821 ")).toEqual({ ok: true, value: "cliente_4821" });
  });

  it("rejects unsafe usernames", () => {
    expect(validateUsername("cliente.com").ok).toBe(false);
    expect(validateUsername("12").ok).toBe(false);
  });

  it("returns a friendly password rule", () => {
    expect(validatePassword("123")).toEqual({ ok: false, error: "Sua senha precisa ter pelo menos 8 caracteres." });
  });

  it("requires at least eight characters for new accounts", () => {
    expect(validatePassword("abc1234").ok).toBe(false);
    expect(validatePassword("senhaBoa9021")).toEqual({ ok: true, value: "senhaBoa9021" });
  });

  it("rejects common passwords", () => {
    expect(validatePassword("12345678").ok).toBe(false);
  });

  it("normalizes usernames consistently", () => {
    expect(normalizeUsername(" Cliente_4821 ")).toBe("cliente_4821");
  });
});