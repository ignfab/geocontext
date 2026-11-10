import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type CallToolResult } from "@modelcontextprotocol/server";

import type { McpTool } from "../../../src/helpers/tools";

type JsonSchema = Record<string, any>;

/**
 * Calls a tool through a real MCP server and client (input validation,
 * output validation and error handling included).
 */
export async function toolCall(
  tool: McpTool<any>,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
): Promise<CallToolResult> {
  // Imported lazily: a static import would load the WFS catalog before the
  // tests' `vi.doMock` calls.
  const { registerTool } = await import("../../../src/helpers/tools");
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTool(server, tool);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    // Cached by the client, which then checks `structuredContent` against the
    // published `outputSchema`.
    await client.listTools();
    return (await client.callTool(request.params)) as CallToolResult;
  } finally {
    await client.close();
  }
}

/**
 * Builds the tool definition as published by the SDK in `tools/list`.
 */
export function toolDefinition(tool: McpTool<any>) {
  const options = { target: "draft-2020-12" } as const;
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    annotations: tool.annotations,
    inputSchema: tool.inputSchema["~standard"].jsonSchema.input(options) as JsonSchema,
    ...(tool.outputSchema && { outputSchema: tool.outputSchema["~standard"].jsonSchema.output(options) as JsonSchema }),
  };
}
