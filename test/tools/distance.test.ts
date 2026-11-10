import { afterEach, describe, it, expect, vi } from "vitest";

import DistanceTool from "../../src/tools/DistanceTool.js";
import { expectErrorText, expectFrenchIssue } from "./helpers/errorAssertions.js";
import { navigationItineraryClient } from "../../src/gpf/itinerary.js";
import { ellipsoidalDistance, haversine } from "../../src/helpers/distance.js";
import { toolCall, toolDefinition } from "./helpers/mcp.js";

describe("Test DistanceTool", () => {
  const departure = { lon: 2.3522, lat: 48.8566 };
  const arrival = { lon: 2.2945, lat: 48.8584 };

  afterEach(() => vi.restoreAllMocks());
  
  it("should publish an optional profile and a distance output schema", () => {
    const tool = new DistanceTool();
    expect(toolDefinition(tool).title).toEqual("Distance et temps de trajet entre deux points");
    expect(toolDefinition(tool).inputSchema.required).not.toContain("profile");
    expect(toolDefinition(tool).inputSchema.properties?.profile).toMatchObject({
      enum: ["spherical", "ellipsoidal", "car", "pedestrian"],
      default: "spherical",
    });
    expect(toolDefinition(tool).outputSchema).toBeDefined();
  });

  it.each([undefined, "spherical", "ellipsoidal"])("should return a structured distance for profile %s", async (profile) => {
    const tool = new DistanceTool();
    const response = await toolCall(tool, {
      params: {
        name: "distance",
        arguments: { departure, arrival, ...(profile && { profile }) },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({ distance: expect.any(Number) });
    expect((response.structuredContent as { distance: number }).distance).toBeGreaterThan(0);
    expect(response.content[0]).toMatchObject({ type: "text" });
  });

  it("should reject invalid coordinates at the tool boundary", async () => {
    const tool = new DistanceTool();
    const response = await toolCall(tool, {
      params: {
        name: "distance",
        arguments: { departure: { lon: 600, lat: 48.8566 }, arrival },
      },
    });

    expectFrenchIssue(expectErrorText(response), "departure.lon", /180/);
  });

  it.each([
    ["spherical", haversine],
    ["ellipsoidal", ellipsoidalDistance],
  ] as const)("should return the rounded %s distance", async (profile, calculateDistance) => {
    const response = await toolCall(new DistanceTool(), {
      params: { name: "distance", arguments: { departure, arrival, profile } },
    });
    const expected = Math.round(calculateDistance(
      [departure.lon, departure.lat], [arrival.lon, arrival.lat],
    ) * 100) / 100;

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toEqual({ distance: expected });
    expect(JSON.parse((response.content[0] as { type: "text"; text: string }).text)).toEqual({ distance: expected });
  });

  it.each([
    ["car", 395174.126, 395174.13, 212, 212],
    ["pedestrian", 12345, 12345, 67.83, 67.8],
  ] as const)("should return itinerary distance and time for %s", async (profile, rawDistance, distance, duration, time) => {
    const tool = new DistanceTool();
    const getItinerarySpy = vi.spyOn(navigationItineraryClient, "getItinerary").mockResolvedValue({ distance: rawDistance, duration });
    const response = await toolCall(tool, {
      params: { name: "distance", arguments: { departure, arrival, profile } },
    });

    expect(getItinerarySpy).toHaveBeenCalledWith({ departure, arrival, profile, optimize: "time" });
    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({ type: "text" });
    expect(JSON.parse((response.content[0] as { type: "text"; text: string }).text)).toEqual({ distance, time });
    expect(response.structuredContent).toEqual({ distance, time });
  });

  it("should forward optimize=distance to itinerary client", async () => {
    const getItinerarySpy = vi.spyOn(navigationItineraryClient, "getItinerary").mockResolvedValue({
      distance: 999,
      duration: 10,
    });

    await toolCall(new DistanceTool(), {
      params: { name: "distance", arguments: { departure, arrival, profile: "car", optimize: "distance" } },
    });

    expect(getItinerarySpy).toHaveBeenCalledWith({ departure, arrival, profile: "car", optimize: "distance" });
  });
});
