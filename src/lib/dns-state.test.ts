import { describe, expect, it } from "vitest";
import { classifyDnsAvailability, effectiveAccessStatus, accessStatusLabel } from "./dns-state";

describe("DNS availability and customer access", () => {
  const probe = (successCount: number, previousFailureCount = 0, previousStatus = "online") =>
    classifyDnsAvailability({ successCount, resolverCount: 5, reportStatus: successCount === 5 ? "ok" : "degraded", previousFailureCount, previousStatus });
  it("confirms offline after two consecutive 0/5 samples", () => {
    expect(probe(0).status).toBe("unstable");
    const next = probe(0, 1, "unstable");
    expect(next.status).toBe("offline");
    expect(next.failureCount).toBe(2);
  });
  it("confirms severely degraded DNS after two independent attempts even with a stale responder", () => {
    expect(probe(1, 0).status).toBe("unstable");
    expect(probe(1, 1, "unstable").status).toBe("offline");
  });
  it("does not mark 2/5 responders as definitely offline", () => {
    expect(probe(2, 4, "offline")).toMatchObject({ status: "unstable", failureCount: 0 });
  });
  it("keeps an offline DNS offline while only a single resolver answers", () => {
    expect(probe(1, 2, "offline").status).toBe("offline");
  });
  it("recovers from an offline DNS only after sufficient independent answers", () => {
    expect(probe(5, 4, "offline").status).toBe("online");
    expect(probe(5, 4, "offline").failureCount).toBe(0);
  });
  it("keeps the service status separate but marks access via DNS unavailable", () => {
    const s = { dns_enabled: true, dns_status: "offline", current_status: "up" };
    expect(effectiveAccessStatus(s)).toBe("down");
    expect(accessStatusLabel(s)).toMatch(/DNS OFFLINE/);
    expect(effectiveAccessStatus({ ...s, dns_enabled: false })).toBe("up");
  });
  it("never claims healthy DNS without actual resolver results", () => {
    expect(classifyDnsAvailability({successCount:0,resolverCount:0,reportStatus:"ok",previousFailureCount:0}).status).toBe("unstable");
  });
});
