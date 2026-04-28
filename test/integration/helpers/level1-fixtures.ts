import { afterAll, beforeAll } from "vitest";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { connectToServer } from "./mcp-client.js";
import type { McpServerHandle } from "./mcp-client.js";

/**
 * Options used to configure the shared MCP server fixture for level1 tests.
 */
export interface McpServerFixtureOptions {
  /**
   * Optional setup callback executed after the MCP server is connected.
   * It can prepare additional shared test state.
   */
  setup?: (handle: McpServerHandle) => Promise<void> | void;
  /**
   * Timeout used for the `beforeAll` setup phase.
   */
  connectTimeout?: number;
}

/**
 * Registers a shared MCP server lifecycle for a test suite and returns a typed
 * accessor to the connected server handle.
 *
 * @param options Optional fixture configuration.
 * @returns Accessor for the connected MCP server handle.
 */
export function withMcpServer(options: McpServerFixtureOptions = {}) {
  let handle: McpServerHandle | undefined;

  beforeAll(async () => {
    handle = await connectToServer();
    await options.setup?.(handle);
  }, options.connectTimeout ?? INTEGRATION_CONFIG.connectTimeout);

  afterAll(async () => {
    await handle?.cleanup();
  });

  return {
    /**
     * Returns the connected MCP server handle.
     *
     * @returns Connected MCP server handle.
     * @throws {Error} When the fixture is accessed before setup.
     */
    getHandle(): McpServerHandle {
      if (!handle) {
        throw new Error("MCP server fixture is not initialized yet.");
      }

      return handle;
    },
  };
}
