import { describe, it, expect } from "vitest";
import { MAX_MIRROR_AGE_MS, mirrorFresh, readMirrorTargets } from "./mirror-fallback.mjs";

const now=1_800_000_000_000;
const id="11111111-2222-4333-8444-555555555555";
function mock(snapshot,rows) {
  return { prepare(sql) {
    if (sql.includes("edge_target_sync_state")) return {first:async()=>snapshot};
    if (sql.includes("edge_target_mirror")) return {all:async()=>({results:rows})};
    throw new Error("unexpected query");
  }};
}
const snapshot={target_count:1,last_sync_ms:now-60_000};
const rows=[{server_id:id,host:"one.example",source_status:"offline",checked_at_ms:now-120_000,last_status:"down"}];

describe("Cloudflare inventory emergency fallback",()=>{
  it("accepts a recent, exact signed-mirror snapshot",async()=>{
    expect(mirrorFresh(snapshot,now)).toBe(true);
    expect(await readMirrorTargets(mock(snapshot,rows),now)).toEqual(rows);
  });
  it("rejects expired and future inventories",async()=>{
    expect(mirrorFresh({...snapshot,last_sync_ms:now-MAX_MIRROR_AGE_MS-1},now)).toBe(false);
    expect(mirrorFresh({...snapshot,last_sync_ms:now+60_001},now)).toBe(false);
    await expect(readMirrorTargets(mock({...snapshot,last_sync_ms:now-MAX_MIRROR_AGE_MS-1},rows),now))
      .rejects.toThrow("mirror_missing_or_expired");
  });
  it("fails closed on truncated or unexpectedly empty inventories",async()=>{
    await expect(readMirrorTargets(mock({...snapshot,target_count:2},rows),now))
      .rejects.toThrow("mirror_inventory_incomplete");
    await expect(readMirrorTargets(mock(snapshot,[]),now))
      .rejects.toThrow("mirror_inventory_incomplete");
  });
  it("fails closed on malformed hostnames and duplicate IDs",async()=>{
    await expect(readMirrorTargets(mock(snapshot,[{...rows[0],host:"http://localhost/"}]),now))
      .rejects.toThrow("mirror_invalid_target");
    await expect(readMirrorTargets(mock({...snapshot,target_count:2},[rows[0],rows[0]]),now))
      .rejects.toThrow("mirror_invalid_target");
  });
  it("never resurrects a deleted/disabled target in the fallback",async()=>{
    const db=mock({...snapshot,target_count:0},[]);
    await expect(readMirrorTargets(db,now)).rejects.toThrow("mirror_missing_or_expired");
  });
});
