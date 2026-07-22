import { describe, expect, it } from "vitest";

import { buildDataUrl } from "../../src/proxy/dataUrl";

const ENDPOINT = "/api/v1/proxy";
const TOKEN = "abc-DEF_123";

describe("proxy/dataUrl · buildDataUrl", () => {
  it("appends the endpoint to a bare-origin base", () => {
    const url = buildDataUrl("https://proxy.example.test", ENDPOINT, TOKEN);
    expect(url).toBe("https://proxy.example.test/api/v1/proxy?q=abc-DEF_123");
  });

  it("normalizes a trailing slash on the base (no double slash)", () => {
    const url = buildDataUrl("https://proxy.example.test/", ENDPOINT, TOKEN);
    expect(url).toBe("https://proxy.example.test/api/v1/proxy?q=abc-DEF_123");
    expect(url).not.toContain("//api/v1");
  });

  it("PRESERVES an ingress path prefix on the base (P2 fix)", () => {
    const url = buildDataUrl("https://example.test/published/proxy", ENDPOINT, TOKEN);
    // The prefix must survive — new URL(endpoint, base) would have dropped it.
    expect(url).toBe("https://example.test/published/proxy/api/v1/proxy?q=abc-DEF_123");
  });

  it("preserves a path prefix even with a trailing slash", () => {
    const url = buildDataUrl("https://example.test/published/proxy/", ENDPOINT, TOKEN);
    expect(url).toBe("https://example.test/published/proxy/api/v1/proxy?q=abc-DEF_123");
    expect(url).not.toContain("proxy//api");
  });

  it("url-encodes the token in the q parameter", () => {
    const url = buildDataUrl("https://proxy.example.test", ENDPOINT, "a b+c");
    const parsed = new URL(url);
    // Round-trips to the exact token regardless of encoding.
    expect(parsed.searchParams.get("q")).toBe("a b+c");
  });
});
