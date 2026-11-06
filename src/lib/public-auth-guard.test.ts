import { describe, expect, it } from "vitest";
import { authRequestError, readSmallAuthJson } from "./public-auth-guard.server";

describe("public authentication request guard", () => {
  it("allows a small same-origin JSON request", async () => {
    const request = new Request("https://streammonitor.site/api/public/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ username: "cliente123" }),
    });
    expect(authRequestError(request)).toBeNull();
    expect(await readSmallAuthJson(request)).toEqual({ username: "cliente123" });
  });

  it("rejects cross-site form submissions", () => {
    const request = new Request("https://streammonitor.site/api/public/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: "{}",
    });
    expect(authRequestError(request)?.status).toBe(403);
  });

  it("rejects unsupported content types", () => {
    const request = new Request("https://streammonitor.site/api/public/login", {
      method: "POST", headers: { "content-type": "text/plain" }, body: "123",
    });
    expect(authRequestError(request)?.status).toBe(415);
  });

  it("rejects oversized payloads even without Content-Length", async () => {
    const request = new Request("https://streammonitor.site/api/public/signup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ junk: "x".repeat(5000) }),
    });
    expect(await readSmallAuthJson(request)).toBeNull();
  });
});
