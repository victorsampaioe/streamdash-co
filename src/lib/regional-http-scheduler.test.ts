import { describe, expect, it } from "vitest";
import { selectHttpTargets } from "../../cloudflare/dns-core/regional-combined-worker.js";

function sample(size = 228, timestamp = "2026-11-20T16:00:00Z") {
  return Array.from({length:size}, (_,i)=>({
    server_id: String(i).padStart(4,"0"),
    last_checked_at: timestamp,
    host: "test" + i + ".example.org",
  }));
}
describe("regional edge HTTP scheduler", () => {
  it("covers 228 active servers within ten one-minute runs", () => {
    const inventory=sample();
    const checked=new Set<string>();
    const origin=Date.parse("2026-11-20T17:30:00Z");
    for(let minute=0;minute<10;minute++){
      const now=origin+minute*60_000;
      const batch=selectHttpTargets(inventory, now);
      expect(batch.length).toBe(30);
      expect(new Set(batch.map(x=>x.server_id)).size).toBe(30);
      batch.forEach(x=>{
        checked.add(x.server_id);
        x.last_checked_at=new Date(now).toISOString();
      });
    }
    expect(checked.size).toBe(228);
  });
  it("prioritizes a new, never-checked server", () => {
    const list=sample(140, "2026-11-20T17:00:00Z");
    list[120].last_checked_at=null as any;
    expect(selectHttpTargets(list,Date.parse("2026-11-20T17:30:00Z"))
      .some(x=>x.server_id===list[120].server_id)).toBe(true);
  });
  it("rotates even when multiple old timestamps never update", () => {
    const list=sample(170);
    const first=new Set(selectHttpTargets(list,Date.parse("2026-11-20T17:30:00Z")).map(x=>x.server_id));
    const next=selectHttpTargets(list,Date.parse("2026-11-20T17:31:00Z"));
    expect(next.some(x=>!first.has(x.server_id))).toBe(true);
  });
  it("never exceeds concurrency batch limits for small inventories",()=>{
    const s=sample(12);
    expect(selectHttpTargets(s,Date.now()).length).toBe(12);
    expect(selectHttpTargets(s,Date.now(),0)).toHaveLength(0);
  });
});
