/**
 * E2E test: agent searches for WFS types about buildings.
 *
 * Port of test_search_batiment.py from geocontext-test.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { invokeAgent } from "../helpers/level2-agent.js";
import { expectNormalizedFinalMessageContainsAll } from "../helpers/level2-assertions.js";
import {
  createMcpClient,
  SYSTEM_PROMPT,
  E2E_TIMEOUT,
  CONNECT_TIMEOUT,
  HAS_MODEL_PROVIDER_API_KEY,
} from "../config/level2-agent.js";
import type { MultiServerMCPClient } from "@langchain/mcp-adapters";

const USER_INPUT = "Dans quelle table peut-on trouver des informations sur les bâtiments?";

const describeIfProvider = HAS_MODEL_PROVIDER_API_KEY ? describe : describe.skip;

describeIfProvider("Agent E2E: search WFS types for buildings", () => {
  let client: MultiServerMCPClient | undefined;

  beforeAll(async () => {
    client = createMcpClient();
  }, CONNECT_TIMEOUT);

  afterAll(async () => {
    await client?.close();
  });

  it("should mention building-related WFS tables", async () => {
    const tools = await client.getTools();
    expect(tools.length).toBeGreaterThan(0);

    const result = await invokeAgent({
      userInput: USER_INPUT,
      tools,
      systemPrompt: SYSTEM_PROMPT,
    });

    expectNormalizedFinalMessageContainsAll(result.messages, [
      "bdtopo_v3:batiment",
      "cadastralparcels.parcellaire_express:batiment",
    ]);
  }, E2E_TIMEOUT);
});
