import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createServer, tools } from "../src/server";
import { toolDefinition } from "./tools/helpers/mcp";

describe("Test createServer", () => {
  let client: Client;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    serveStdio(createServer, { transport: serverTransport });
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  // The tool list of src/server.ts is explicit: a tool added to src/tools must
  // also be added there.
  it("should register every tool of src/tools", async () => {
    const toolsDir = fileURLToPath(new URL("../src/tools/", import.meta.url));
    const expectedNames: string[] = [];
    for (const file of readdirSync(toolsDir)) {
      const { default: Tool } = await import(join(toolsDir, file));
      expectedNames.push(new Tool().name);
    }

    const { tools: listed } = await client.listTools();

    expect(listed.map((tool) => tool.name).sort()).toEqual(expectedNames.sort());
  });

  // Every published parameter must be described for the LLM.
  it("should describe every input parameter", async () => {
    const { tools: listed } = await client.listTools();

    for (const tool of listed) {
      for (const [name, property] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((property as { description?: string }).description, `${tool.name}.${name}`).toBeTruthy();
      }
    }
  });

  // The tool tests check `toolDefinition`: it must match what the SDK publishes.
  it("should publish the tool definitions", async () => {
    const { tools: listed } = await client.listTools();

    for (const tool of tools) {
      expect(listed.find((definition) => definition.name === tool.name)).toEqual(toolDefinition(tool));
    }
  });

  // Served like src/index.ts does in stdio mode.
  it.each([
    { protocolVersion: "2026-07-28", clientOptions: { versionNegotiation: { mode: { pin: "2026-07-28" } } } },
    // By default, the SDK client speaks the 2025 protocol.
    { protocolVersion: "2025-11-25", clientOptions: {} },
  ] as const)("should serve the $protocolVersion protocol", async ({ protocolVersion, clientOptions }) => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    serveStdio(createServer, { transport: serverTransport });
    const versionClient = new Client({ name: "test", version: "0.0.0" }, clientOptions);

    try {
      await versionClient.connect(clientTransport);
      expect(versionClient.getNegotiatedProtocolVersion()).toBe(protocolVersion);
      expect((await versionClient.listTools()).tools).toHaveLength(tools.length);

      const result = await versionClient.callTool({ name: "geocode", arguments: { text: "" } });
      expect(result.content).toMatchObject([{ type: "text", text: expect.stringContaining("Paramètres invalides") }]);
    } finally {
      await versionClient.close();
    }
  });

  it("should reject an unknown tool", async () => {
    await expect(client.callTool({ name: "unknown_tool", arguments: {} })).rejects.toMatchObject({
      code: -32602,
    });
  });
});
