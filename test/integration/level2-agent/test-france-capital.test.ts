/**
 * E2E test: basic agent test without MCP tools.
 *
 * Port of test_france_capital.py from geocontext-test.
 * This test verifies that the LLM agent itself works correctly.
 */

import { describe, it } from "vitest";
import { E2E_TIMEOUT, HAS_MODEL_PROVIDER_API_KEY } from "../config/level2-agent.js";
import { invokeAgent } from "../helpers/level2-agent.js";
import { expectNormalizedFinalMessageContainsAll } from "../helpers/level2-assertions.js";

const USER_INPUT = "Quelle est la capitale de la France?";
const describeIfProvider = HAS_MODEL_PROVIDER_API_KEY ? describe : describe.skip;

describeIfProvider("Agent E2E: basic question (no tools)", () => {
  it("should answer that Paris is the capital of France", async () => {
    const result = await invokeAgent({
      userInput: USER_INPUT,
      tools: [],
    });

    expectNormalizedFinalMessageContainsAll(result.messages, ["paris"]);
  }, E2E_TIMEOUT);
});
