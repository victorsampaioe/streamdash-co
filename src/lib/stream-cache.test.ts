import { describe, expect, it } from "vitest";
import { segmentCacheDecision } from "./stream-cache";

const base = {
  type: "live",
  ext: "ts",
  isHlsManifest: false,
  status: 200,
  hasRange: false,
  enabled: true,
  ttlSeconds: 15,
};

describe("segmentCacheDecision", () => {
  it("cacheia segmento ao vivo quando habilitado", () => {
    expect(segmentCacheDecision(base)?.cacheControl).toBe("public, max-age=15, s-maxage=15");
  });

  it("não cacheia nada com a flag desligada (rollback)", () => {
    expect(segmentCacheDecision({ ...base, enabled: false })).toBeNull();
  });

  it("nunca cacheia manifesto", () => {
    expect(segmentCacheDecision({ ...base, ext: "m3u8", isHlsManifest: true })).toBeNull();
  });

  it("nunca cacheia VOD (filme/série)", () => {
    expect(segmentCacheDecision({ ...base, type: "movie", ext: "mp4" })).toBeNull();
    expect(segmentCacheDecision({ ...base, type: "series", ext: "mkv" })).toBeNull();
  });

  it("nunca cacheia resposta com Range", () => {
    expect(segmentCacheDecision({ ...base, hasRange: true, status: 206 })).toBeNull();
  });

  it("nunca cacheia erro (403/404/502)", () => {
    for (const status of [401, 403, 404, 500, 502]) {
      expect(segmentCacheDecision({ ...base, status })).toBeNull();
    }
  });

  it("limita o TTL a no máximo 60s", () => {
    expect(segmentCacheDecision({ ...base, ttlSeconds: 9999 })?.cacheControl).toContain("max-age=60");
    expect(segmentCacheDecision({ ...base, ttlSeconds: 0 })?.cacheControl).toContain("max-age=1");
  });
});
