/**
 * Integration test: altitude tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { paris, chamonix } from "../samples.js";

interface AltitudeResult {
  result: {
    lon: number;
    lat: number;
    altitude: number;
    accuracy: string;
  };
}

describe("Altitude Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should return altitude for Paris (~35 m)", async () => {
    const result = await callTool<AltitudeResult>(getHandle().client, "altitude", {
      lon: paris.lon,
      lat: paris.lat,
    });

    expect(result.result).toBeDefined();
    expect(result.result.altitude).toBeDefined();
    expect(typeof result.result.altitude).toBe("number");
    // Paris altitude is approximately 35 m, with some tolerance
    expect(result.result.altitude).toBeGreaterThan(20);
    expect(result.result.altitude).toBeLessThan(100);
    expect(result.result.accuracy).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should return altitude for Chamonix (~1035 m)", async () => {
    const result = await callTool<AltitudeResult>(getHandle().client, "altitude", {
      lon: chamonix.lon,
      lat: chamonix.lat,
    });

    expect(result.result).toBeDefined();
    expect(result.result.altitude).toBeDefined();
    expect(typeof result.result.altitude).toBe("number");
    // Chamonix altitude is approximately 1035 m
    expect(result.result.altitude).toBeGreaterThan(900);
    expect(result.result.altitude).toBeLessThan(1100);
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for out-of-range coordinates", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "altitude", { lon: 600, lat: 600 }));
  }, INTEGRATION_CONFIG.timeout);
});
