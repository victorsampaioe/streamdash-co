import { describe, expect, it } from "vitest";
import { validateEncryptedCredentialBatch, type PreparedCredentialRow } from "./migration-credential-batch.server";

const iv = btoa(String.fromCharCode(...new Uint8Array(12).fill(1)));
const iv2 = btoa(String.fromCharCode(...new Uint8Array(12).fill(2)));
const ciphertext = btoa(String.fromCharCode(...new Uint8Array(24).fill(9)));
const server = { server_id: "synthetic-server-1", credentials_present: 1, source_snapshot_id: "synthetic-snapshot" };
const row: PreparedCredentialRow = {
  server_id: server.server_id,
  username_ciphertext_b64: ciphertext,
  username_iv_b64: iv,
  password_ciphertext_b64: ciphertext,
  password_iv_b64: iv2,
  algorithm: "AES-256-GCM",
  key_version: 1,
  source_snapshot_id: server.source_snapshot_id,
  imported_at: "2026-11-19T13:00:00Z",
};
describe("encrypted staging batch validation", () => {
  it("accepts a valid synthetic envelope", () => {
    expect(validateEncryptedCredentialBatch([row], [server]).accepted).toBe(1);
  });
  it("rejects an unknown server", () => {
    expect(() => validateEncryptedCredentialBatch([row], [])).toThrow();
  });
  it("rejects snapshot mismatch", () => {
    expect(() => validateEncryptedCredentialBatch([{ ...row, source_snapshot_id: "wrong" }], [server])).toThrow();
  });
  it("rejects repeated nonce", () => {
    expect(() => validateEncryptedCredentialBatch([{ ...row, password_iv_b64: iv }], [server])).toThrow();
  });
  it("rejects duplicate server identifiers", () => {
    expect(() => validateEncryptedCredentialBatch([row, row], [server])).toThrow();
  });
  it("rejects malformed ciphertext", () => {
    expect(() => validateEncryptedCredentialBatch([{ ...row, password_ciphertext_b64: "invalid" }], [server])).toThrow();
  });
  it("rejects empty credentials", () => {
    expect(() => validateEncryptedCredentialBatch([{ ...row, username_ciphertext_b64: null, username_iv_b64: null, password_ciphertext_b64: null, password_iv_b64: null }], [server])).toThrow();
  });
});
