import { afterEach, describe, expect, it } from "vitest";
import { captureAttribution, readAttributionPlatform, readAttributionSource, sanitizeAttributionInput } from "./ad-attribution";

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

describe("plataforma do anúncio", () => {
  it("utm_source=ig do anúncio vira Instagram", () => {
    setup("?utm_source=ig&utm_medium=paid_social&utm_term=instagram_reels");
    captureAttribution();
    expect(readAttributionPlatform()).toBe("instagram");
  });

  it("utm_source=fb do anúncio vira Facebook", () => {
    setup("?utm_source=fb&utm_medium=paid_social");
    captureAttribution();
    expect(readAttributionPlatform()).toBe("facebook");
  });

  it("servidor recusa origem inventada e guarda Instagram com posicionamento", () => {
    expect(sanitizeAttributionInput({ source: "hacker", utm_source: "ig" })).toBeNull();
    const ok = sanitizeAttributionInput({ source: "meta_ads", utm_source: "ig", utm_term: "instagram_stories" });
    expect(ok?.acquisition_platform).toBe("instagram");
    expect(ok?.acquisition_placement).toBe("instagram_stories");
  });
});

describe("atribuição resiliente em navegadores internos", () => {
  it("conserva o primeiro anúncio em vez de sobrescrever com um segundo clique", () => {
    setup("?utm_source=ig&utm_campaign=first_ad&utm_medium=paid_social");
    captureAttribution();
    (window as any).location.search = "?utm_source=fb&utm_campaign=second_ad";
    captureAttribution();
    expect(readAttributionPlatform()).toBe("instagram");
  });

  it("guarda a origem em memória quando o navegador bloqueia armazenamento", () => {
    setup("?utm_source=fb&utm_campaign=ad_browser");
    (globalThis as any).localStorage = {
      getItem: () => { throw new Error("Private mode"); },
      setItem: () => { throw new Error("Private mode"); },
    };
    captureAttribution();
    expect(readAttributionPlatform()).toBe("facebook");
  });
});
