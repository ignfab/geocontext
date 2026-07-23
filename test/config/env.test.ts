import { describe, it, expect } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv", () => {

  // --- Defaults ---

  it("should return all defaults when source is empty", () => {
    const env = parseEnv({});
    expect(env).toMatchObject({
      TRANSPORT_TYPE: "stdio",
      HTTP_HOST: "127.0.0.1",
      HTTP_PORT: 3000,
      HTTP_MCP_ENDPOINT: "/mcp",
      LOG_LEVEL: "debug",
      LOG_FORMAT: "simple",
      NODE_ENV: "development",
      USER_AGENT: "geocontext",
      HTTP_TIMEOUT: 15,
      GPF_WFS_RATE_LIMIT: 30,
      GPF_GEOCODE_RATE_LIMIT: 50,
      GPF_ALTI_RATE_LIMIT: 50,
      GPF_NAVIGATION_RATE_LIMIT: 5,
      PROXY_MAX_RESPONSE_BYTES: 25 * 1024 * 1024,
    });
    expect(env).not.toHaveProperty("HTTP_CORS_ALLOWED_ORIGINS");
    expect(env).not.toHaveProperty("GPF_WFS_MINISEARCH_OPTIONS");
  });

  it("should override PROXY_MAX_RESPONSE_BYTES from the environment", () => {
    const env = parseEnv({ PROXY_MAX_RESPONSE_BYTES: "5242880" });
    expect(env.PROXY_MAX_RESPONSE_BYTES).toBe(5242880);
  });

  it.each(["0", "-1", "3.14", "abc"])(
    "should reject an invalid PROXY_MAX_RESPONSE_BYTES (%s)",
    (bad) => {
      expect(() => parseEnv({ PROXY_MAX_RESPONSE_BYTES: bad })).toThrow(/Invalid environment configuration/);
    },
  );

  it("should fall back to the PROXY_MAX_RESPONSE_BYTES default on empty/blank", () => {
    expect(parseEnv({ PROXY_MAX_RESPONSE_BYTES: "" }).PROXY_MAX_RESPONSE_BYTES).toBe(25 * 1024 * 1024);
    expect(parseEnv({ PROXY_MAX_RESPONSE_BYTES: "  " }).PROXY_MAX_RESPONSE_BYTES).toBe(25 * 1024 * 1024);
  });

  it("should treat empty/whitespace strings as undefined (fallback to defaults)", () => {
    const env = parseEnv({ HTTP_HOST: "  ", HTTP_PORT: "", LOG_LEVEL: "  " });
    expect(env.HTTP_HOST).toBe("127.0.0.1");
    expect(env.HTTP_PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("debug");
  });

  // --- Valid overrides ---

  it("should accept valid explicit values", () => {
    const env = parseEnv({
      TRANSPORT_TYPE: "http",
      HTTP_HOST: "0.0.0.0",
      HTTP_PORT: "8080",
      HTTP_MCP_ENDPOINT: "/api/mcp",
      LOG_LEVEL: "warn",
      LOG_FORMAT: "json",
      NODE_ENV: "production",
      USER_AGENT: "my-agent",
      HTTP_TIMEOUT: "30",
      GPF_WFS_RATE_LIMIT: "10",
      GPF_GEOCODE_RATE_LIMIT: "20",
      GPF_ALTI_RATE_LIMIT: "100",
      GPF_NAVIGATION_RATE_LIMIT: "5",
      PROXY_URL_SECRET: "a".repeat(64), // 32 bytes as hex
    });
    expect(env.TRANSPORT_TYPE).toBe("http");
    expect(env.HTTP_PORT).toBe(8080);
    expect(env.HTTP_TIMEOUT).toBe(30);
    expect(env.GPF_WFS_RATE_LIMIT).toBe(10);
    expect(env.GPF_NAVIGATION_RATE_LIMIT).toBe(5);
  });

  // --- PROXY_URL_SECRET (presence is enforced per entry point, not by parseEnv;
  // parseEnv only validates the FORMAT when a value is present) ---

  it("should not require PROXY_URL_SECRET (presence enforced by entry points)", () => {
    // parseEnv accepts a missing secret even in http mode; src/index.ts and
    // src/proxy/index.ts enforce presence for their own needs.
    expect(() => parseEnv({ TRANSPORT_TYPE: "http" })).not.toThrow();
    expect(parseEnv({ TRANSPORT_TYPE: "http" })).not.toHaveProperty("PROXY_URL_SECRET");
    expect(parseEnv({ TRANSPORT_TYPE: "stdio" })).not.toHaveProperty("PROXY_URL_SECRET");
  });

  it("should decode a 32-byte PROXY_URL_SECRET to a Buffer", () => {
    const env = parseEnv({ PROXY_URL_SECRET: "a".repeat(64) });
    expect(Buffer.isBuffer(env.PROXY_URL_SECRET)).toBe(true);
    expect((env.PROXY_URL_SECRET as Buffer).length).toBe(32);
  });

  it("should reject a PROXY_URL_SECRET that is hex but not 32 bytes", () => {
    expect(() => parseEnv({ PROXY_URL_SECRET: "abcd" })).toThrow(/hex characters/);
  });

  it("should reject a PROXY_URL_SECRET that is 64 chars but not hex", () => {
    expect(() => parseEnv({ PROXY_URL_SECRET: "z".repeat(64) })).toThrow(/hex characters/);
  });

  // --- PROXY_PUBLIC_BASE_URL validation ---

  it("should accept a clean http(s) base URL (with or without a path prefix)", () => {
    expect(parseEnv({ PROXY_PUBLIC_BASE_URL: "https://geollm.example.fr" }).PROXY_PUBLIC_BASE_URL)
      .toBe("https://geollm.example.fr");
    expect(parseEnv({ PROXY_PUBLIC_BASE_URL: "https://geollm.example.fr/published/proxy" }).PROXY_PUBLIC_BASE_URL)
      .toBe("https://geollm.example.fr/published/proxy");
    expect(parseEnv({ PROXY_PUBLIC_BASE_URL: "http://localhost:3002" }).PROXY_PUBLIC_BASE_URL)
      .toBe("http://localhost:3002");
  });

  it("should treat an empty/blank PROXY_PUBLIC_BASE_URL as undefined (not run through the refine)", () => {
    expect(parseEnv({ PROXY_PUBLIC_BASE_URL: "" }).PROXY_PUBLIC_BASE_URL).toBeUndefined();
    expect(parseEnv({ PROXY_PUBLIC_BASE_URL: "   " }).PROXY_PUBLIC_BASE_URL).toBeUndefined();
  });

  it("should reject a non-URL PROXY_PUBLIC_BASE_URL", () => {
    expect(() => parseEnv({ PROXY_PUBLIC_BASE_URL: "not a url" })).toThrow("Invalid environment configuration");
  });

  it("should reject a PROXY_PUBLIC_BASE_URL carrying a query or fragment (would break data_url)", () => {
    // buildDataUrl appends the endpoint + ?q= by concatenation, so a query/fragment
    // on the base would swallow the endpoint and 404 silently at map-load.
    expect(() => parseEnv({ PROXY_PUBLIC_BASE_URL: "https://host/base?foo=1" })).toThrow("Invalid environment configuration");
    expect(() => parseEnv({ PROXY_PUBLIC_BASE_URL: "https://host/base#frag" })).toThrow("Invalid environment configuration");
  });

  it("should reject a non-http(s) PROXY_PUBLIC_BASE_URL scheme", () => {
    expect(() => parseEnv({ PROXY_PUBLIC_BASE_URL: "ftp://host/base" })).toThrow("Invalid environment configuration");
  });

  // --- CORS ---

  it("should parse comma-separated CORS origins", () => {
    const env = parseEnv({ HTTP_CORS_ALLOWED_ORIGINS: "http://localhost:3000, https://example.com" });
    expect(env.HTTP_CORS_ALLOWED_ORIGINS).toEqual(["http://localhost:3000", "https://example.com"]);
  });

  it("should return undefined for empty CORS string", () => {
    const env = parseEnv({ HTTP_CORS_ALLOWED_ORIGINS: "  ,  , " });
    expect(env.HTTP_CORS_ALLOWED_ORIGINS).toBeUndefined();
  });

  // --- GPF_WFS_MINISEARCH_OPTIONS (JSON) ---

  it("should parse valid JSON in GPF_WFS_MINISEARCH_OPTIONS", () => {
    const opts = JSON.stringify({ fuzzy: 0.2, combineWith: "OR" });
    const env = parseEnv({ GPF_WFS_MINISEARCH_OPTIONS: opts });
    expect(env.GPF_WFS_MINISEARCH_OPTIONS).toEqual({ fuzzy: 0.2, combineWith: "OR" });
  });

  it("should reject invalid JSON in GPF_WFS_MINISEARCH_OPTIONS", () => {
    expect(() => parseEnv({ GPF_WFS_MINISEARCH_OPTIONS: "{not json" }))
      .toThrow("Invalid environment configuration");
  });

  it("should accept empty string in GPF_WFS_MINISEARCH_OPTIONS (treated as undefined)", () => {
    const env = parseEnv({ GPF_WFS_MINISEARCH_OPTIONS: "" });
    expect(env.GPF_WFS_MINISEARCH_OPTIONS).toBeUndefined();
  });

  // --- Validation errors ---

  it("should reject invalid TRANSPORT_TYPE", () => {
    expect(() => parseEnv({ TRANSPORT_TYPE: "websocket" }))
      .toThrow("Invalid environment configuration");
  });

  it("should reject port out of range", () => {
    expect(() => parseEnv({ HTTP_PORT: "0" })).toThrow("Expected a port between 1 and 65535");
    expect(() => parseEnv({ HTTP_PORT: "99999" })).toThrow("Expected a port between 1 and 65535");
  });

  it("should reject non-numeric port", () => {
    expect(() => parseEnv({ HTTP_PORT: "abc" })).toThrow("Invalid environment configuration");
  });

  it("should reject negative HTTP_TIMEOUT", () => {
    expect(() => parseEnv({ HTTP_TIMEOUT: "-5" })).toThrow("Invalid environment configuration");
  });

  it("should reject zero rate limit", () => {
    expect(() => parseEnv({ GPF_WFS_RATE_LIMIT: "0" })).toThrow("Invalid environment configuration");
  });

  it("should reject non-integer rate limit", () => {
    expect(() => parseEnv({ GPF_ALTI_RATE_LIMIT: "3.5" })).toThrow("Invalid environment configuration");
  });

  // --- HTTP_MCP_ENDPOINT validation ---

  it("should reject endpoint without leading slash", () => {
    expect(() => parseEnv({ HTTP_MCP_ENDPOINT: "mcp" })).toThrow("Invalid environment configuration");
  });

  it("should reject endpoint with query string", () => {
    expect(() => parseEnv({ HTTP_MCP_ENDPOINT: "/mcp?foo=bar" })).toThrow("Invalid environment configuration");
  });

  it("should reject double-slash endpoint", () => {
    expect(() => parseEnv({ HTTP_MCP_ENDPOINT: "//mcp" })).toThrow("Invalid environment configuration");
  });
});
