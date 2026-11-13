import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import request from "supertest";

import { resetEnv } from "../src/config/env";
import { createRequestHandler } from "../src/http";
import logger from "../src/logger";

describe("Test MCP HTTP server", () => {
  let server: Server;

  beforeAll(async () => {
    process.env.HTTP_CORS_ALLOWED_ORIGINS = "http://localhost:3000,vscode-webview://abc";
    resetEnv();
    server = createServer(createRequestHandler()).listen(0, "127.0.0.1");
    await once(server, "listening");
  });

  afterAll(() => {
    server.close();
    delete process.env.HTTP_CORS_ALLOWED_ORIGINS;
    resetEnv();
  });

  it("should answer the health probe", async () => {
    const response = await request(server).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it.each(["http://localhost:3000", "vscode-webview://ABC"])("should answer CORS preflight requests from %s", async (origin) => {
    const response = await request(server).options("/mcp").set("Origin", origin);

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    // Browser clients send `Content-Type: application/json`, `MCP-Protocol-Version`...
    expect(response.headers["access-control-allow-headers"]).toBe("*");
  });

  it.each(["http://evil.example", "http://localhost:4000", "https://localhost:3000", "vscode-webview://other", "null"])("should reject the origin %s", async (origin) => {
    const response = await request(server).get("/health").set("Origin", origin);

    expect(response.status).toBe(403);
  });

  it.each([
    {
      protocolVersion: "2026-07-28",
      clientOptions: { versionNegotiation: { mode: { pin: "2026-07-28" } } },
      cacheHint: { ttlMs: 3_600_000, cacheScope: "public" },
    },
    { protocolVersion: "2025-11-25", clientOptions: {}, cacheHint: {} },
  ] as const)("should serve the $protocolVersion protocol", async ({ protocolVersion, clientOptions, cacheHint }) => {
    const { port } = server.address() as AddressInfo;
    const client = new Client({ name: "test", version: "0.0.0" }, clientOptions);

    try {
      // From an allowed origin, which the Origin check must let through.
      const requestInit = { headers: { Origin: "http://localhost:3000" } };
      const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit });
      await client.connect(transport);
      expect(transport.sessionId).toBeUndefined();
      expect(client.getNegotiatedProtocolVersion()).toBe(protocolVersion);
      expect(client.getServerCapabilities()?.tools).toEqual({ listChanged: false });

      const listing = await client.listTools();
      expect(listing.tools.map((tool) => tool.name)).toContain("geocode");
      // `toEqual` ignores undefined fields: no cache hint at all in the 2025 protocol.
      expect({ ttlMs: listing.ttlMs, cacheScope: listing.cacheScope }).toEqual(cacheHint);

      const result = await client.callTool({ name: "geocode", arguments: { text: "" } });
      expect(result.isError).toBe(true);
      expect(result.content).toMatchObject([{ type: "text", text: expect.stringContaining("Paramètres invalides") }]);
    } finally {
      await client.close();
    }
  });

  it.each(["/unknown", "//"])("should answer 404 outside the MCP endpoint (%s)", async (path) => {
    const response = await request(server).get(path);

    expect(response.status).toBe(404);
  });

  it.each([
    // A 2025-era request must accept both JSON and SSE.
    { accept: "application/json", body: { jsonrpc: "2.0", id: 1, method: "ping" }, status: 406, log: "Not Acceptable" },
    { accept: "application/json, text/event-stream", body: "x".repeat(4 * 1024 * 1024 + 1), status: 413, log: "(413)" },
  ])("should log the $status client errors", async ({ accept, body, status, log }) => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    try {
      const response = await request(server).post("/mcp").set("Accept", accept).type("json").send(body);

      expect(response.status).toBe(status);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(log));
    } finally {
      warn.mockRestore();
    }
  });
});
