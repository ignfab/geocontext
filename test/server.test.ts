import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createServer } from "../src/server";

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

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedNames.sort());
  });

  // Every published parameter must be described for the LLM.
  it("should describe every input parameter", async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      for (const [name, property] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((property as { description?: string }).description, `${tool.name}.${name}`).toBeTruthy();
      }
    }
  });

  it("should reject an unknown tool", async () => {
    await expect(client.callTool({ name: "unknown_tool", arguments: {} })).rejects.toMatchObject({
      code: -32602,
    });
  });
});
