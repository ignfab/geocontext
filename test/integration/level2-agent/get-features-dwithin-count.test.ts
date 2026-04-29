/**
 * E2E test: basic agent test without MCP tools.
 *
 * Port of test_france_capital.py from geocontext-test.
 * This test verifies that the LLM agent itself works correctly.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONNECT_TIMEOUT, createMcpClient, E2E_TIMEOUT, HAS_MODEL_PROVIDER_API_KEY } from "../config/level2-agent.js";
import { invokeAgent } from "../helpers/level2-agent.js";
import { expectNormalizedFinalMessageContainsAll } from "../helpers/level2-assertions.js";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const USER_INPUT = "Combien de lycées sont situés à 2km du chateau de vincennes";
const describeIfProvider = HAS_MODEL_PROVIDER_API_KEY ? describe : describe.skip;

describeIfProvider("Agent E2E: count lycées near the chateau de Vincennes (2km)", () => {

  let client: MultiServerMCPClient | undefined;

  beforeAll(async () => {
    client = createMcpClient();
  }, CONNECT_TIMEOUT);

  afterAll(async () => {
    await client?.close();
  });

  it("should answer the question about 14 lycées near the chateau de Vincennes", async () => {

    const tools = await client!.getTools();
    expect(tools.length).toBeGreaterThan(0);

    const result = await invokeAgent({
      userInput: USER_INPUT,
      tools: tools,
    });

    expectNormalizedFinalMessageContainsAll(result.messages, ["14", "lycées", "chateau de Vincennes"]);
  }, E2E_TIMEOUT);
});
