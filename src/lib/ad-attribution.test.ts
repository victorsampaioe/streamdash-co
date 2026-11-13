import { afterEach, describe, expect, it } from "vitest";
import { captureAttribution, readAttributionSource } from "./ad-attribution";

function setup(search: string) {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  (globalThis as any).window = { location: { search, pathname: "/" } };
}

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

describe("origem da visita", () => {
  it("visita com fbclid conta como vinda do anúncio Meta", () => {
    setup("?fbclid=abc");
    expect(captureAttribution()?.source).toBe("meta_ads");
    expect(readAttributionSource()).toBe("meta_ads");
  });

  it("visita sem parâmetros de campanha não é atribuída a anúncio", () => {
    setup("");
    expect(captureAttribution()).toBeNull();
    expect(readAttributionSource()).toBe("direct");
  });
});
