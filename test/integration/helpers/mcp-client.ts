/**
 * Provides helpers to connect to the geocontext MCP server via stdio.
 *
 * Usage in tests:
 * ```ts
 * const { client, cleanup } = await connectToServer();
 * // ... use client ...
 * await cleanup();
 * ```
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

/**
 * Represents a connected MCP server handle.
 */
export interface McpServerHandle {
  /** Connected MCP client instance. */
  client: Client;
  /** Underlying stdio transport connected to the spawned server process. */
  transport: StdioClientTransport;
  /** Closes both the client and the transport. */
  cleanup: () => Promise<void>;
}

/**
 * Starts the geocontext MCP server and connects a client to it via stdio.
 *
 * @returns A handle containing the connected client, the transport, and a cleanup function.
 */
export async function connectToServer(): Promise<McpServerHandle> {
  const transport = new StdioClientTransport({
    command: INTEGRATION_CONFIG.serverCommand,
    args: [...INTEGRATION_CONFIG.serverArgs],
    env: INTEGRATION_CONFIG.serverEnv(),
    stderr: "pipe",
  });

  const client = new Client(
    { name: "integration-test-client", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport, { timeout: INTEGRATION_CONFIG.connectTimeout });

  const cleanup = async () => {
    await client.close();
    await transport.close();
  };

  return { client, transport, cleanup };
}

// ─── Convenience helpers ─────────────────────────────────────────────

interface TextContent {
  type: "text";
  text: string;
}

function isTextContent(value: unknown): value is TextContent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { type?: unknown; text?: unknown };
  return candidate.type === "text" && typeof candidate.text === "string";
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content.filter(isTextContent).map((item) => item.text).join("\n");
}

/**
 * Calls a server tool and parses its textual JSON response.
 *
 * @param client Connected MCP client.
  * @param toolName Tool name to call.
  * @param args Tool input arguments.
  * @returns Parsed JSON payload of the tool response.
 * @throws {Error} When the tool returns `isError: true`.
 * @throws {SyntaxError} When tool text output is not valid JSON.
 */
export async function callTool<T = unknown>(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.callTool({ name: toolName, arguments: args });
  const text = extractTextContent(result.content);

  if (result.isError) {
    throw new Error(`Tool "${toolName}" returned an error: ${text}`);
  }

  return JSON.parse(text) as T;
}

/**
 * Lists all tools exposed by the server.
 *
 * @param client Connected MCP client.
  * @returns Tool descriptors exposed by the server.
 */
export async function listTools(client: Client) {
  const response = await client.listTools();
  return response.tools;
}
