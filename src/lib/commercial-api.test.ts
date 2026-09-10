import { describe,expect,it } from "vitest";
import { API_SCOPES, apiKeyPrefix } from "./commercial-api.server";
describe("STREAM MONITOR API contracts",()=>{it("keeps scopes closed",()=>expect(API_SCOPES).toEqual(["servers:read","monitoring:read","performance:read","incidents:read","analytics:read","ai:read","webhooks:manage"]));it("does not include write scopes",()=>expect(API_SCOPES.every(scope=>!scope.includes("write"))).toBe(true));it("extracts the indexed key prefix",()=>expect(apiKeyPrefix("sm_live_abc123_supersecret")).toBe("sm_live_abc123"));});
