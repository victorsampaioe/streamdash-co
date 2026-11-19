import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { advance, initialState, publicStatus, targetLanes } from "./monitor-state.mjs";
import { recordSample, claimEvents, settleEvent } from "./monitor-store.mjs";

const sample = (at, verdict, kind = "dns") => ({ at, kind,
  proofs: ["cloudflare", "google"].map(source => ({ source, verdict })) });
const outage = () => advance(initialState(), sample(60_000, "down"), "incident-1").state;
describe("flapping guard", () => {
  it("requires two independent proofs, not repeats from one region", () => {
    let state = initialState();
    for (let at = 60_000; at <= 180_000; at += 60_000)
      state = advance(state, { at, kind: "http", proofs: [{ source: "cf-edge", verdict: "down" }] }, "one").state;
    expect(state.incident).toBeNull();
    expect(state.http.phase).toBe("SUSPECT");
    state = advance(state, { at: 181_000, kind: "http", proofs: [{ source: "independent-edge", verdict: "down" }] }, "two").state;
    expect(state.http.phase).toBe("OFFLINE");
  });
  it("keeps public OFFLINE for exactly five minutes of consecutive success", () => {
    let state = outage();
    for (let at = 120_000; at < 420_000; at += 60_000) {
      const result = advance(state, sample(at, "ok"), "unused");
      state = result.state;
      expect(publicStatus(state.dns)).toBe("OFFLINE");
      expect(result.event).toBeNull();
    }
    const result = advance(state, sample(420_000, "ok"), "unused");
    expect(result.state.dns.phase).toBe("ONLINE");
    expect(result.event?.id).toBe("incident-1:recovered");
    expect(advance(result.state, sample(480_000, "ok"), "unused").event).toBeNull();
  });
  it("resets recovery on failure without opening another incident or sending down", () => {
    let state = advance(outage(), sample(120_000, "ok"), "unused").state;
    const failure = advance(state, sample(180_000, "down"), "unused");
    expect(failure.event).toBeNull();
    expect(failure.state.dns.recoveryAt).toBeNull();
    expect(failure.state.incident.id).toBe("incident-1");
    state = advance(failure.state, sample(240_000, "ok"), "unused").state;
    expect(state.dns.recoveryAt).toBe(240_000);
  });
  it("unknown infrastructure cannot open an outage and interrupts recovery", () => {
    expect(advance(initialState(), sample(60_000, "unknown"), "unused").state.dns.phase).toBe("UNKNOWN");
    const recovering = advance(outage(), sample(120_000, "ok"), "unused").state;
    const result = advance(recovering, sample(180_000, "unknown"), "unused");
    expect(result.state.dns.phase).toBe("OFFLINE");
    expect(result.state.dns.recoveryAt).toBeNull();
    expect(result.event).toBeNull();
  });
  it("missing checks reset the five-minute window", () => {
    const recovering = advance(outage(), sample(120_000, "ok"), "unused").state;
    expect(advance(recovering, sample(480_000, "ok"), "unused").state.dns.recoveryAt).toBe(480_000);
  });
  it("DNS and HTTP share one incident but recover independently", () => {
    let state = advance(outage(), sample(120_000, "down", "http"), "unused").state;
    expect(state.incident.kinds).toEqual(["dns", "http"]);
    for (let at = 180_000; at <= 480_000; at += 60_000)
      state = advance(state, sample(at, "ok"), "unused").state;
    expect(state.incident.id).toBe("incident-1");
    expect(state.http.phase).toBe("OFFLINE");
  });
  it("priority targets run every minute without starving normal rotation", () => {
    const targets = Array.from({ length: 100 }, (_, i) => ({ server_id: String(i), priority: i < 60 }));
    const a = targetLanes(targets, 0), b = targetLanes(targets, 1);
    expect(a.priority).toHaveLength(60);
    expect(b.priority).toHaveLength(60);
    expect(a.normal).toHaveLength(20);
    expect(b.normal).toHaveLength(20);
    expect(new Set([...a.normal, ...b.normal].map(t => t.server_id)).size).toBe(40);
  });
});

describe("real local D1 atomicity (no customer data or network sending)", () => {
  let mf, db;
  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('local test')}}", d1Databases: { DB: "guard-test" } });
    db = await mf.getD1Database("DB");
    const sql = await readFile(new URL("./migrations/0001_monitor_guard.sql", import.meta.url), "utf8");
    for (const statement of sql.replace(/--[^\n]*/g, "").split(";").filter(s => s.trim())) await db.prepare(statement).run();
  });
  afterAll(async () => { await mf?.dispose(); });
  it("concurrent cron/Queue samples create exactly one incident and down event", async () => {
    await Promise.all(Array.from({ length: 8 }, () => recordSample(db, "test-server", sample(60_000, "down"))));
    expect((await db.prepare("SELECT count(*) n FROM monitor_incidents").first()).n).toBe(1);
    expect((await db.prepare("SELECT count(*) n FROM monitor_events WHERE event='down'").first()).n).toBe(1);
    for (let at = 120_000; at <= 420_000; at += 60_000)
      await Promise.all([recordSample(db, "test-server", sample(at, "ok")), recordSample(db, "test-server", sample(at, "ok"))]);
    expect((await db.prepare("SELECT count(*) n FROM monitor_events WHERE event='recovered'").first()).n).toBe(1);
    expect((await db.prepare("SELECT count(*) n FROM monitor_incidents WHERE recovered_at_ms IS NULL").first()).n).toBe(0);
  });
  it("concurrent delivery consumers claim each event only once; stale tokens cannot settle", async () => {
    const [a, b] = await Promise.all([claimEvents(db, 500_000, "cron"), claimEvents(db, 500_000, "queue")]);
    expect(a.length + b.length).toBe(2);
    expect(new Set([...a, ...b].map(r => r.id)).size).toBe(2);
    const item = [...a, ...b][0];
    await settleEvent(db, item.id, "wrong-token", "sent", 510_000);
    expect((await db.prepare("SELECT status FROM monitor_events WHERE id=?").bind(item.id).first()).status).toBe("processing");
    await settleEvent(db, item.id, item.claim_token, "sent", 510_000);
    expect((await db.prepare("SELECT status FROM monitor_events WHERE id=?").bind(item.id).first()).status).toBe("sent");
  });
  it("expired delivery is uncertain, never automatically resent", async () => {
    expect(await claimEvents(db, 700_000, "later")).toHaveLength(0);
    expect((await db.prepare("SELECT count(*) n FROM monitor_events WHERE status='uncertain'").first()).n).toBe(1);
  });
});