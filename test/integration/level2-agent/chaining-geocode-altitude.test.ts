/**
 * E2E test: agent chains geocode → altitude tools.
 *
 * Port of test_chaining_geocode.py from geocontext-test.
 *
 * The agent should:
 * 1. Geocode "mairie de Chamonix"
 * 2. Use the resulting coordinates to get the altitude
 * 3. Return a response containing "Chamonix" and the altitude (~1036 m)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { invokeAgent } from "../helpers/level2-agent.js";
import {
  expectNormalizedFinalMessageContainsAll,
  ToolCallTracker,
} from "../helpers/level2-assertions.js";
import {
  createMcpClient,
  SYSTEM_PROMPT,
  E2E_TIMEOUT,
  CONNECT_TIMEOUT,
  HAS_MODEL_PROVIDER_API_KEY,
} from "../config/level2-agent.js";
import type { MultiServerMCPClient } from "@langchain/mcp-adapters";

const USER_INPUT = "Quelle est l'altitude de la mairie de Chamonix?";

const describeIfProvider = HAS_MODEL_PROVIDER_API_KEY ? describe : describe.skip;

function hasAltitudeInRange(text: string, min: number, max: number): boolean {
  const values = [...text.matchAll(/\b\d[\d ]{0,5}\b/g)]
    .map(([value]) => Number(value.replace(/\s+/g, "")))
    .filter((value) => Number.isFinite(value));

  return values.some((value) => value >= min && value <= max);
}

describeIfProvider("Agent E2E: chaining geocode → altitude", () => {
  let client: MultiServerMCPClient | undefined;

  beforeAll(async () => {
    client = createMcpClient();
  }, CONNECT_TIMEOUT);

  afterAll(async () => {
    await client?.close();
  });

  it("should chain geocode and altitude tools to answer the question", async () => {
    const tools = await client!.getTools();
    expect(tools.length).toBeGreaterThan(0);

    const tracker = new ToolCallTracker();

    const result = await invokeAgent({
      userInput: USER_INPUT,
      tools,
      systemPrompt: SYSTEM_PROMPT,
      callbacks: [tracker],
    });

    expect(tracker.hasToolCall("geocode")).toBe(true);
    expect(tracker.hasToolCall("altitude")).toBe(true);

    const normalizedText = expectNormalizedFinalMessageContainsAll(result.messages, ["chamonix"]);
    expect(hasAltitudeInRange(normalizedText, 1000, 1100)).toBe(true);
  }, E2E_TIMEOUT);
});
