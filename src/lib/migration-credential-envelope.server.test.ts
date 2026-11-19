import { describe, expect, it } from "vitest";
import {
  prepareEncryptedServerCredential,
  verifyEncryptedServerCredential,
} from "./migration-credential-envelope.server";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe("isolated credential migration encryption", () => {
  it("encrypts username and password separately and verifies both", async () => {
    const source = { serverId: "synthetic-server-1", username: "demo-user", password: "demo-password" };
    const encrypted = await prepareEncryptedServerCredential(source, key);
    expect(encrypted.username_ciphertext_b64).not.toContain("demo-user");
    expect(encrypted.password_ciphertext_b64).not.toContain("demo-password");
    expect(encrypted.username_iv_b64).not.toBe(encrypted.password_iv_b64);
    expect(await verifyEncryptedServerCredential(source, encrypted, key)).toBe(true);
  });

  it("rejects ciphertext moved to a different server", async () => {
    const source = { serverId: "synthetic-server-1", username: "demo-user", password: "demo-password" };
    const encrypted = await prepareEncryptedServerCredential(source, key);
    await expect(verifyEncryptedServerCredential(
      { ...source, serverId: "synthetic-server-2" },
      { ...encrypted, server_id: "synthetic-server-2" },
      key,
    )).rejects.toThrow();
  });

  it("rejects field swaps", async () => {
    const source = { serverId: "synthetic-server-1", username: "demo-user", password: "demo-password" };
    const encrypted = await prepareEncryptedServerCredential(source, key);
    await expect(verifyEncryptedServerCredential(source, {
      ...encrypted,
      username_ciphertext_b64: encrypted.password_ciphertext_b64,
      username_iv_b64: encrypted.password_iv_b64,
    }, key)).rejects.toThrow();
  });

  it("rejects empty source credentials", async () => {
    await expect(prepareEncryptedServerCredential(
      { serverId: "synthetic-server-1", username: null, password: null }, key,
    )).rejects.toThrow("No credentials");
  });
});
