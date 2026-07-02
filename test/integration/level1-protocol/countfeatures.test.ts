/**
 * Integration test: CountFeatures tool with real API calls.
 *
 * Uses BDTOPO_V3:commune to test attribute filtering with a known code INSEE.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import {
  expectToolCallToThrow,
} from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

interface CountFeatures {
  numberMatched: number;
}

describe("CountFeatures (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should query BDTOPO_V3:plan_d_eau with bbox filter (around Lac du Bourget)", async () => {
    const result = await callTool<CountFeatures>(getHandle().client, "gpf_count_features", {
      typename: "BDTOPO_V3:plan_d_eau",
      bbox_filter: {
        "west": 5.815544,
        "south": 45.647168,
        "east": 5.900345,
        "north": 45.808222
      },
    });

    expect(result.numberMatched).toBe(4); // Lac du Bourget (1), Étang des Aigrettes (1), Lacs de Chevelu (2)
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for invalid typename", async () => {
    await expectToolCallToThrow(
      callTool(getHandle().client, "gpf_count_features", {
        typename: "INVALID:type",
      }),
    );
  }, INTEGRATION_CONFIG.timeout);
});
