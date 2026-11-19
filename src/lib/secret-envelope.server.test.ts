import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-envelope.server";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const wrongKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)));

describe("secret envelope", () => {
  it("round trips UTF-8 secrets", async () => {
    const envelope = await encryptSecret("senha-🔒-á", key, "server:123");
    expect(await decryptSecret(envelope, key, "server:123")).toBe("senha-🔒-á");
  });
  it("uses fresh nonces", async () => {
    const a = await encryptSecret("same", key, "server:123");
    const b = await encryptSecret("same", key, "server:123");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("rejects wrong key and record id", async () => {
    const envelope = await encryptSecret("secret", key, "server:123");
    await expect(decryptSecret(envelope, wrongKey, "server:123")).rejects.toThrow();
    await expect(decryptSecret(envelope, key, "server:456")).rejects.toThrow();
  });
  it("rejects invalid key length", async () => {
    await expect(encryptSecret("secret", btoa("short"), "server:123")).rejects.toThrow();
  });
});
