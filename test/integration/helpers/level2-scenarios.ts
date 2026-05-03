import { expect } from "vitest";
import { SYSTEM_PROMPT } from "../config/level2-agent.js";
import { invokeAgent } from "./level2-agent.js";
import {
  expectNormalizedFinalMessageContainsAll,
  ToolCallTracker,
} from "./level2-assertions.js";

type AgentTools = Parameters<typeof invokeAgent>[0]["tools"];

/** Context passed to a scenario-specific assertion hook. */
export interface Level2ScenarioContext {
  /** Raw LangChain result returned by the agent invocation. */
  result: Awaited<ReturnType<typeof invokeAgent>>;
  /** Normalized final agent message, ready for string checks. */
  normalizedFinalMessage: string;
  /** Tool call tracker, available when the scenario uses tracking. */
  toolCallTracker?: ToolCallTracker;
}

interface BaseLevel2AgentScenario {
  /** Vitest test name shown in the suite output. */
  testName: string;
  /** End-user prompt sent to the agent. */
  userInput: string;
  /** Fragments that must appear in the final response. */
  expectedResponseFragments: string[];
  /** Tool names that must have been called at least once. */
  requiredToolCalls?: string[];
  /** Optional extra assertions for cases that need more than string checks. */
  assertScenarioResult?: (context: Level2ScenarioContext) => void | Promise<void>;
}

export interface NoToolsLevel2AgentScenario extends BaseLevel2AgentScenario {
  /** Run the scenario without MCP tools. */
  toolMode: "none";
}

export interface McpLevel2AgentScenario extends BaseLevel2AgentScenario {
  /** Run the scenario with the shared MCP toolset and default system prompt. */
  toolMode: "mcp";
}

export type Level2AgentScenario = NoToolsLevel2AgentScenario | McpLevel2AgentScenario;

interface RunLevel2ScenarioOptions {
  tools?: AgentTools;
}

function resolveScenarioTools(
  scenario: Level2AgentScenario,
  options: RunLevel2ScenarioOptions,
): AgentTools {
  if (scenario.toolMode === "none") {
    return [];
  }

  if (!options.tools) {
    throw new Error(`Scenario "${scenario.testName}" requires MCP tools.`);
  }

  if (options.tools.length === 0) {
    throw new Error(`Scenario "${scenario.testName}": MCP tools list is empty.`);
  }

  return options.tools;
}

export async function runLevel2Scenario(
  scenario: Level2AgentScenario,
  options: RunLevel2ScenarioOptions = {},
): Promise<void> {
  const tools = resolveScenarioTools(scenario, options);
  const shouldTrackTools =
    (scenario.requiredToolCalls?.length ?? 0) > 0 || Boolean(scenario.assertScenarioResult);
  const toolCallTracker = shouldTrackTools ? new ToolCallTracker() : undefined;

  const result = await invokeAgent({
    userInput: scenario.userInput,
    tools,
    systemPrompt: scenario.toolMode === "mcp" ? SYSTEM_PROMPT : undefined,
    callbacks: toolCallTracker ? [toolCallTracker] : undefined,
  });

  const normalizedFinalMessage = expectNormalizedFinalMessageContainsAll(
    result.messages,
    scenario.expectedResponseFragments,
  );

  const requiredToolCalls = scenario.requiredToolCalls ?? [];

  if (requiredToolCalls.length > 0 && !toolCallTracker) {
    throw new Error(`Scenario "${scenario.testName}": tool-call tracking was not initialized.`);
  }

  const trackedToolCallTracker = requiredToolCalls.length > 0 ? toolCallTracker : undefined;

  for (const toolName of requiredToolCalls) {
    expect(
      trackedToolCallTracker!.hasToolCall(toolName),
      `Scenario "${scenario.testName}": expected tool "${toolName}" to have been called.`,
    ).toBe(true);
  }

  await scenario.assertScenarioResult?.({
    result,
    normalizedFinalMessage,
    toolCallTracker,
  });
}
