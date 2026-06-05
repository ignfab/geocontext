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
    });
    expect(env).not.toHaveProperty("HTTP_CORS_ALLOWED_ORIGINS");
    expect(env).not.toHaveProperty("GPF_WFS_MINISEARCH_OPTIONS");
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
    });
    expect(env.TRANSPORT_TYPE).toBe("http");
    expect(env.HTTP_PORT).toBe(8080);
    expect(env.HTTP_TIMEOUT).toBe(30);
    expect(env.GPF_WFS_RATE_LIMIT).toBe(10);
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
