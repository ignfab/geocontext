import { describe, expect, it } from "vitest";
import { NavigationItineraryClient } from "../../src/gpf/itinerary.js";
import { RateLimiter } from "../../src/helpers/RateLimiter.js";

describe("NavigationItineraryClient", () => {
  it("should build an itinerary request and return distance and duration", async () => {
    const urls: string[] = [];
    const client = new NavigationItineraryClient(
      new RateLimiter({ name: "test", maxCalls: 100, period: 1 }),
      async (url) => {
        urls.push(url);
        return {
          distance: 395174,
          duration: 212,
        };
      },
    );

    const itinerary = await client.getItinerary({
      departure: { // 117 rue de Paris, 02100 Saint-Quentin
        lon: 3.274356,
        lat: 49.839862,
      },
      arrival: { // 8 place de la République, 21000 Dijon
        lon: 5.044572,
        lat: 47.326213,
      },
      profile: "car",
    });

    expect(itinerary).toEqual({
      distance: 395174,
      duration: 212,
      geometry: null,
    });

    const parsedUrl = new URL(urls[0]);
    expect(parsedUrl.origin + parsedUrl.pathname).toEqual("https://data.geopf.fr/navigation/itineraire");
    expect(parsedUrl.searchParams.get("resource")).toEqual("bdtopo-osrm");
    expect(parsedUrl.searchParams.get("start")).toEqual("3.274356,49.839862");
    expect(parsedUrl.searchParams.get("end")).toEqual("5.044572,47.326213");
    expect(parsedUrl.searchParams.get("profile")).toEqual("car");
    expect(parsedUrl.searchParams.get("optimization")).toEqual("fastest");
    expect(parsedUrl.searchParams.get("timeUnit")).toEqual("minute");
    expect(parsedUrl.searchParams.get("distanceUnit")).toEqual("meter");
    expect(parsedUrl.searchParams.get("crs")).toEqual("EPSG:4326");
    expect(parsedUrl.searchParams.get("geometryFormat")).toEqual("polyline");
    expect(parsedUrl.searchParams.get("getSteps")).toEqual("false");
    expect(parsedUrl.searchParams.get("getBbox")).toEqual("false");
    expect(parsedUrl.searchParams.get("waysAttributes")).toEqual("name");
  });
});