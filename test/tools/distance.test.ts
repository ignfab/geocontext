import { afterEach, describe, expect, it, vi } from "vitest";

import { navigationItineraryClient } from "../../src/gpf/itinerary.js";
import DistanceTool from "../../src/tools/DistanceTool";

describe("Test DistanceTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return itinerary distance and time for car profile", async () => {
    const tool = new DistanceTool();
    const getItinerarySpy = vi.spyOn(navigationItineraryClient, "getItinerary").mockResolvedValue({
      distance: 395174,
      duration: 212,
      geometry: null,
    });

    const response = await tool.toolCall({
      params: {
        name: "distance",
        arguments: {
          departure: {
            lon: 3.274356,
            lat: 49.839862,
          },
          arrival: {
            lon: 5.044572,
            lat: 47.326213,
          },
          profile: "car",
        },
      },
    });

    expect(getItinerarySpy).toHaveBeenCalledWith({
      departure: {
        lon: 3.274356,
        lat: 49.839862,
      },
      arrival: {
        lon: 5.044572,
        lat: 47.326213,
      },
      profile: "car",
    });
    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({
      type: "text",
    });

    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }

    expect(JSON.parse(textContent.text)).toEqual({
      distance: 395174,
      time: 212,
    });
    expect(response.structuredContent).toEqual({
      distance: 395174,
      time: 212,
    });
  });
});