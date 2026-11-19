import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import worker from "./private-metadata-pull.mjs";

const token = "c".repeat(64);
const sourceToken = "s".repeat(64);
const baseEnv = {
  MIGRATION_CONTROL_TOKEN: token,
  SOURCE_EXPORT_TOKEN: sourceToken,
  SOURCE_EXPORT_URL: "https://abcdefghijklmnopqrst.supabase.co/functions/v1/private-migration-metadata",
};
const request = (body, auth = token) => new Request("https://isolated.example/migrate", {
  method: "POST",
  headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});
const originalFetch = globalThis.fetch;
afterAll(() => { globalThis.fetch = originalFetch; });

test("rejects unauthenticated requests without source calls", async () => {
  globalThis.fetch = () => { throw Error("must not call source"); };
  const res = await worker.fetch(request({ module: "profiles", offset: 0, limit: 10 }, "wrong"), baseEnv);
  assert.equal(res.status, 401);
});
test("rejects deceptive source hostnames", async () => {
  globalThis.fetch = () => { throw Error("must not call source"); };
  const env = { ...baseEnv, SOURCE_EXPORT_URL: "https://abcdefghijklmnopqrst.supabase.co.attacker.invalid/functions/v1/private-migration-metadata" };
  const res = await worker.fetch(request({ module: "profiles", offset: 0, limit: 10 }), env);
  assert.equal(res.status, 503);
});
test("rejects unsupported pagination", async () => {
  const res = await worker.fetch(request({ module: "profiles", offset: -1, limit: 51 }), baseEnv);
  assert.equal(res.status, 400);
});
test("rejects unexpected fields before database writes", async () => {
  let writes = 0;
  globalThis.fetch = async () => Response.json({
    module: "profiles", offset: 0, contains_secrets: false,
    records: [{ id: "00000000-0000-0000-0000-000000000001", created_at: "2026-11-19T00:00:00Z", password_hash: "unsafe" }],
  });
  const env = { ...baseEnv, PILOT_DB: { prepare() { writes++; return { bind() {} }; }, batch() { writes++; } } };
  const res = await worker.fetch(request({ module: "profiles", offset: 0, limit: 10 }), env);
  assert.equal(res.status, 502);
  assert.equal(writes, 0);
});
test("writes allowed profile metadata to staging only", async () => {
  const prepared = [];
  let batched = 0;
  globalThis.fetch = async () => Response.json({
    module: "profiles", offset: 0, contains_secrets: false,
    records: [{ id: "00000000-0000-0000-0000-000000000001", created_at: "2026-11-19T00:00:00Z", credits: 5 }],
  });
  const env = { ...baseEnv, PILOT_DB: {
    prepare(sql) { prepared.push(sql); return { bind(...values) { return { values }; } }; },
    async batch(items) { batched += items.length; },
  } };
  const res = await worker.fetch(request({ module: "profiles", offset: 0, limit: 10 }), env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).persisted, true);
  assert.equal(batched, 1);
  assert.match(prepared[0], /migration_users_stage/);
});
