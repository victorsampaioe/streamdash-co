import { describe, expect, it } from "vitest";
import {
  authHashAssociatedData, encryptExistingBcryptHash,
  isSupportedBcryptHash, verifyEncryptedBcryptHash,
} from "./migration-auth-hash-envelope.server";
import { decryptSecret } from "./secret-envelope.server";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const hash = "$2a$10$" + "A".repeat(53);
describe("encrypted bcrypt hash migration envelope", () => {
  it("accepts only source bcrypt 2a format", () => {
    expect(isSupportedBcryptHash(hash)).toBe(true);
    expect(isSupportedBcryptHash("plaintext-password")).toBe(false);
    expect(isSupportedBcryptHash("$2b$10$" + "A".repeat(53))).toBe(false);
  });
  it("roundtrips an existing synthetic bcrypt hash", async () => {
    const envelope = await encryptExistingBcryptHash("synthetic-user-1",hash,key);
    expect(await verifyEncryptedBcryptHash("synthetic-user-1",hash,envelope,key)).toBe(true);
  });
  it("rejects moving the encrypted hash to another account", async () => {
    const envelope = await encryptExistingBcryptHash("synthetic-user-1",hash,key);
    await expect(decryptSecret(envelope,key,authHashAssociatedData("synthetic-user-2"))).rejects.toThrow();
  });
  it("rejects plaintext instead of bcrypt hash", async () => {
    await expect(encryptExistingBcryptHash("synthetic-user-1","plaintext-password",key)).rejects.toThrow();
  });
});
