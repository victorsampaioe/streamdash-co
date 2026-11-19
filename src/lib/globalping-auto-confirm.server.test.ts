import { describe, expect, it } from "vitest";
import { classifyWorldDns, shouldRequestGlobalping, requestWorldDns } from "./globalping-auto-confirm.server";
describe("automatic Globalping DNS confirmation", () => {
  it("requires independent countries for confirmed DNS failure", () => {
    expect(classifyWorldDns([{country:"BR",verdict:"down"},{country:"US",verdict:"down"}])).toBe("dns_failure_confirmed");
    expect(classifyWorldDns([{country:"BR",verdict:"down"},{country:"BR",verdict:"down"}])).toBe("inconclusive");
  });
  it("does not confuse regional errors with worldwide downtime", () => {
    expect(classifyWorldDns([{country:"BR",verdict:"down"},{country:"US",verdict:"ok"}])).toBe("regional_failure");
    expect(classifyWorldDns([{country:"BR",verdict:"ok"},{country:"US",verdict:"ok"}])).toBe("dns_resolves");
  });
  it("throttles and respects paused or ineligible servers", () => {
    const base = { consecutiveFailures:2, now: 1_000_000, paused:false, eligible:true };
    expect(shouldRequestGlobalping(base)).toBe(true);
    expect(shouldRequestGlobalping({...base, paused:true})).toBe(false);
    expect(shouldRequestGlobalping({...base, eligible:false})).toBe(false);
    expect(shouldRequestGlobalping({...base, lastWorldCheckAt:999_999})).toBe(false);
  });
  it("rejects unsafe hosts before sending a token", async () => {
    await expect(requestWorldDns("localhost", "secret", async () => {throw new Error("unexpected") })).rejects.toThrow("invalid_public_hostname");
  });
});
