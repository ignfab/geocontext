import { describe, expect, it } from "vitest";

import { buildDataUrl } from "../../src/proxy/dataUrl";

const ENDPOINT = "/api/v1/proxy";
const TOKEN = "abc-DEF_123";

describe("proxy/dataUrl · buildDataUrl", () => {
  it("appends the endpoint + `<token>.json` to a bare-origin base", () => {
    const url = buildDataUrl("https://proxy.example.test", ENDPOINT, TOKEN);
    expect(url).toBe("https://proxy.example.test/api/v1/proxy/abc-DEF_123.json");
  });

  it("normalizes a trailing slash on the base (no double slash)", () => {
    const url = buildDataUrl("https://proxy.example.test/", ENDPOINT, TOKEN);
    expect(url).toBe("https://proxy.example.test/api/v1/proxy/abc-DEF_123.json");
    expect(url).not.toContain("//api/v1");
  });

  it("PRESERVES an ingress path prefix on the base", () => {
    const url = buildDataUrl("https://example.test/published/proxy", ENDPOINT, TOKEN);
    // The prefix must survive — new URL(endpoint, base) would have dropped it.
    expect(url).toBe("https://example.test/published/proxy/api/v1/proxy/abc-DEF_123.json");
  });

  it("preserves a path prefix even with a trailing slash", () => {
    const url = buildDataUrl("https://example.test/published/proxy/", ENDPOINT, TOKEN);
    expect(url).toBe("https://example.test/published/proxy/api/v1/proxy/abc-DEF_123.json");
    expect(url).not.toContain("proxy//api");
  });

  it("keeps a base64url token verbatim in the path (path-safe, no percent-encoding)", () => {
    const url = buildDataUrl("https://proxy.example.test", ENDPOINT, "abc-DEF_123");
    expect(url).toBe("https://proxy.example.test/api/v1/proxy/abc-DEF_123.json");
    expect(url).not.toContain("%");
  });
});
