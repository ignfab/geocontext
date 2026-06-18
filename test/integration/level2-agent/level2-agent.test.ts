/**
 * E2E tests for level 2 agent scenarios.
 *
 * Ports of the Python level 2 scenarios from geocontext-test.
 */

import type { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import {
  CONNECT_TIMEOUT,
  E2E_TIMEOUT,
  HAS_MODEL_PROVIDER_API_KEY,
  createMcpClient,
} from "../config/level2-agent.js";
import type { Level2AgentScenario } from "../helpers/level2-scenarios.js";
import { runLevel2Scenario } from "../helpers/level2-scenarios.js";

const describeIfProvider = HAS_MODEL_PROVIDER_API_KEY ? describe : describe.skip;

/**
 * Test if the given text contains a number in the specified range.
 * The function looks for numbers containing up to 11 characters, including optional spaces.
 */
function containsNumberInRange(text: string, min: number, max: number): boolean {
  const values = [...text.matchAll(/\b\d[\d ]{0,10}\b/g)]
    .map(([value]) => Number(value.replace(/\s+/g, "")))
    .filter((value) => Number.isFinite(value));

  return values.some((value) => value >= min && value <= max);
}

const noToolScenarios = [
  {
    testName: "should answer that Paris is the capital of France",
    userInput: "Quelle est la capitale de la France?",
    expectedResponseFragments: ["paris"],
    toolMode: "none",
  },
] satisfies Level2AgentScenario[];

const mcpScenarios = [
  {
    testName: "should find ERP-related tables for schools",
    userInput: "Dans quelle table peut-on trouver des informations sur les écoles?",
    expectedResponseFragments: ["bdtopo_v3:zone_d_activite_ou_d_interet"],
    toolMode: "mcp",
  },
  {
    testName: "should mention building-related WFS tables",
    userInput: "Dans quelle table peut-on trouver des informations sur les bâtiments?",
    expectedResponseFragments: [
      "bdtopo_v3:batiment",
      "cadastralparcels.parcellaire_express:batiment",
    ],
    toolMode: "mcp",
    requiredToolCalls: ["gpf_wfs_search_types"],
  },
  {
    testName: "should chain geocode and altitude tools to answer the question",
    userInput: "Quelle est l'altitude de la mairie de Chamonix?",
    expectedResponseFragments: ["chamonix"],
    toolMode: "mcp",
    requiredToolCalls: ["geocode", "altitude"],
    assertScenarioResult: ({ normalizedFinalMessage }) => {
      expect(containsNumberInRange(normalizedFinalMessage, 1000, 1100)).toBe(true);
    },
  },
  {
    testName: "should answer the question about 14 lycées near the chateau de Vincennes",
    userInput: "Combien de lycées sont situés à 2km du chateau de vincennes?",
    expectedResponseFragments: ["14", "lycées"],
    toolMode: "mcp",
    requiredToolCalls: ["geocode", "gpf_wfs_search_types", "gpf_wfs_describe_type", "gpf_wfs_get_features"],
  },
  {
    testName: "should find about 1 741 batiments in the commune of Saint Mandé",
    userInput: "Combien y a t il de batiments sur la commune de saint mandé?",
    toolMode: "mcp",
    requiredToolCalls: ["geocode", "gpf_wfs_search_types", "gpf_wfs_describe_type", "gpf_wfs_get_features"],
    expectedResponseFragments: ["batiments"],
    assertScenarioResult: ({ normalizedFinalMessage }) => {
      expect(containsNumberInRange(normalizedFinalMessage, 1700, 1800)).toBe(true);
    },
  },
  {
    testName: "should find 19 batiments of more than 30 meters in Angouleme",
    userInput: "Combien y a t il de batiments de plus de 30 mètres sur la commune d'Angoulême?",
    toolMode: "mcp",
    requiredToolCalls: ["geocode", "gpf_wfs_search_types", "gpf_wfs_describe_type", "gpf_wfs_get_features"],
    // assuming that it won't often change and that the number is correct at the moment of writing
    // (switch to assertScenarioResult with a range if needed in the future)
    expectedResponseFragments: ["19", "batiments"] 
  },
  {
    testName: "should find that Sivom swimming pool in Mondeville is the nearest pool to the LUX cinema in Caen, and that the walking distance is 29 minutes",
    userInput: "Quelle est le temps de marche exact entre le cinéma LUX, situé au sud-est de Caen, et la piscine la plus proche ?",
    toolMode: "mcp",
    requiredToolCalls: ["geocode", "gpf_wfs_search_types", "gpf_wfs_describe_type", "gpf_wfs_get_features", "distance"],
    expectedResponseFragments: ["Sivom", "Mondeville", "29 minutes"]
  }
] satisfies Level2AgentScenario[];

describeIfProvider("Agent E2E: basic questions (no tools)", () => {
  it.each(noToolScenarios)("$testName", async (scenario) => {
    await runLevel2Scenario(scenario);
  }, E2E_TIMEOUT);
});

describeIfProvider("Agent E2E: MCP-backed scenarios", () => {
  let client: MultiServerMCPClient | undefined;
  let tools: Awaited<ReturnType<MultiServerMCPClient["getTools"]>> | undefined;

  beforeAll(async () => {
    client = createMcpClient();
    tools = await client.getTools();
  }, CONNECT_TIMEOUT);

  afterAll(async () => {
    await client?.close();
  });

  it.each(mcpScenarios)("$testName", async (scenario) => {
    await runLevel2Scenario(scenario, { tools });
  }, E2E_TIMEOUT);
});
