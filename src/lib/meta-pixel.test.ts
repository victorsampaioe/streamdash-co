import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => ({
  allowed: false,
  listener: null as null | (() => void),
}));

vi.mock("@/lib/consent", () => ({
  canTrack: vi.fn(async () => consent.allowed),
  readChoice: vi.fn(() => consent.allowed ? "granted" : "denied"),
  onConsentChange: vi.fn((listener: () => void) => {
    consent.listener = listener;
    return () => { consent.listener = null; };
  }),
}));

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

let fbq: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  consent.allowed = false;
  consent.listener = null;
  fbq = vi.fn();
  const local = storage();
  const session = storage();
  vi.stubGlobal("window", {
    fbq,
    location: { hostname: "streammonitor.site", pathname: "/" },
    localStorage: local,
    sessionStorage: session,
  });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Meta Pixel: consent-aware measurement", () => {
  it("does not lose a PageView when consent is initially unavailable", async () => {
    const { trackMetaPageView } = await import("./meta-pixel");
    await trackMetaPageView("/");
    expect(fbq.mock.calls.some(([a, b]) => a === "track" && b === "PageView")).toBe(false);
    consent.allowed = true;
    consent.listener?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fbq.mock.calls.filter(([a, b]) => a === "track" && b === "PageView")).toHaveLength(1);
    await trackMetaPageView("/");
    expect(fbq.mock.calls.filter(([a, b]) => a === "track" && b === "PageView")).toHaveLength(1);
  });

  it("emits CompleteRegistration only after consent and only once per signup id", async () => {
    const { trackMetaCompleteRegistration } = await import("./meta-pixel");
    const id = "00000000-0000-4000-8000-000000000001";
    await trackMetaCompleteRegistration(id);
    expect(fbq.mock.calls.filter(([a, b]) => a === "track" && b === "CompleteRegistration")).toHaveLength(0);
    consent.allowed = true;
    await trackMetaCompleteRegistration(id);
    await trackMetaCompleteRegistration(id);
    expect(fbq.mock.calls.filter(([a, b]) => a === "track" && b === "CompleteRegistration")).toHaveLength(1);
  });

  it("emits Purchase with verified amount at most once, and never for zero credit-only value", async () => {
    const { trackMetaPurchase } = await import("./meta-pixel");
    const id = "00000000-0000-4000-8000-000000000002";
    consent.allowed = true;
    await trackMetaPurchase(id, 0);
    await trackMetaPurchase(id, 2500);
    await trackMetaPurchase(id, 2500);
    const purchases = fbq.mock.calls.filter(([a, b]) => a === "track" && b === "Purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0][2]).toEqual({ value: 25, currency: "BRL" });
    expect(purchases[0][3]).toEqual({ eventID: `streammonitor_purchase_${id}` });
  });

  it("never sends Pixel events on private paths", async () => {
    const { trackMetaPageView } = await import("./meta-pixel");
    consent.allowed = true;
    await trackMetaPageView("/app/subscription");
    expect(fbq.mock.calls.filter(([a]) => a === "track")).toHaveLength(0);
  });
});
