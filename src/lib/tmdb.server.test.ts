import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeed } from "./tmdb.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("public TMDB feed compatibility", () => {
  it.each([
    ["movies", "/movie/popular"],
    ["series", "/tv/popular"],
    ["trending", "/trending/all/week"],
  ] as const)("maps the %s feed to a real TMDB endpoint", async (feed, endpoint) => {
    vi.stubEnv("TMDB_API_KEY", "test-key");
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/3" + endpoint);
      return new Response(JSON.stringify({ results: [
        { id: 10, title: "Filme", media_type: "movie" },
        { id: 11, name: "Série", media_type: "tv" },
        { id: 12, name: "Pessoa", media_type: "person" },
      ] }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const items = await fetchFeed(feed, 1);
    expect(request).toHaveBeenCalledOnce();
    if (feed === "trending") {
      expect(items.map(x => x.media_type)).toEqual(["movie", "tv"]);
    } else {
      expect(items.length).toBe(3);
    }
  });
});
