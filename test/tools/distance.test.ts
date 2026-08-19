import { afterEach, describe, expect, it, vi } from "vitest";

import { navigationItineraryClient } from "../../src/gpf/itinerary.js";
import DistanceTool from "../../src/tools/DistanceTool.js";
import { haversine, distanceVincenty } from "../../src/helpers/distance.js";

describe("Test DistanceTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return itinerary distance and time for car profile", async () => {
    const tool = new DistanceTool();
    const getItinerarySpy = vi.spyOn(navigationItineraryClient, "getItinerary").mockResolvedValue({
      distance: 395174,
      duration: 212,
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
      shortest: "time",
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

  it("should return haversine distance for direct profile", async () => {
    const tool = new DistanceTool();

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
          profile: "direct",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(textContent.text);
    const expected = Math.round(haversine([3.274356, 49.839862], [5.044572, 47.326213]) * 100) / 100;
    expect(parsed).toEqual({ distance: expected });
    expect(response.structuredContent).toEqual({ distance: expected });
  });

  it("should return vincenty distance for vincenty profile", async () => {
    const tool = new DistanceTool();

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
          profile: "vincenty",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(textContent.text);
    const expected = Math.round(distanceVincenty([3.274356, 49.839862], [5.044572, 47.326213]) * 100) / 100;
    expect(parsed).toEqual({ distance: expected });
    expect(response.structuredContent).toEqual({ distance: expected });
  });

  it("should return itinerary distance and time for pedestrian profile", async () => {
    const tool = new DistanceTool();
    const getItinerarySpy = vi.spyOn(navigationItineraryClient, "getItinerary").mockResolvedValue({
      distance: 12345,
      duration: 67.8,
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
          profile: "pedestrian",
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
      profile: "pedestrian",
      shortest: "time",
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") throw new Error("expected text content");
    expect(JSON.parse(textContent.text)).toEqual({ distance: 12345, time: 68 });
    expect(response.structuredContent).toEqual({ distance: 12345, time: 68 });
  });

  it("should forward shortest=distance to itinerary client", async () => {
    const tool = new DistanceTool();
    const getItinerarySpy = vi.spyOn(navigationItineraryClient, "getItinerary").mockResolvedValue({
      distance: 999,
      duration: 10,
    });

    await tool.toolCall({
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
          shortest: "distance",
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
      shortest: "distance",
    });
  });
});
