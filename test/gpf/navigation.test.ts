import { describe, expect, it } from "vitest";

import { NavigationIsochroneClient } from "../../src/gpf/navigation.js";
import { RateLimiter } from "../../src/helpers/RateLimiter.js";

describe("NavigationIsochroneClient", () => {
  it("should build a Valhalla travel-time isochrone request and return its GeoJSON geometry", async () => {
    const urls: string[] = [];
    const client = new NavigationIsochroneClient(
      new RateLimiter({ name: "test", maxCalls: 100, period: 1 }),
      async (url) => {
        urls.push(url);
        return {
          geometry: {
            type: "Polygon",
            coordinates: [
              [[2.338306, 48.849753], [2.337306, 48.850142], [2.338306, 48.849753]],
            ],
          },
        };
      },
    );

    const geometry = await client.getTravelTimeGeometry({
      lon: 2.337306,
      lat: 48.849319,
      minutes: 15,
      profile: "pedestrian",
    });

    expect(geometry.type).toEqual("Polygon");
    const parsedUrl = new URL(urls[0]);
    expect(parsedUrl.origin + parsedUrl.pathname).toEqual("https://data.geopf.fr/navigation/isochrone");
    expect(parsedUrl.searchParams.get("resource")).toEqual("bdtopo-valhalla");
    expect(parsedUrl.searchParams.get("point")).toEqual("2.337306,48.849319");
    expect(parsedUrl.searchParams.get("direction")).toEqual("departure");
    expect(parsedUrl.searchParams.get("costType")).toEqual("time");
    expect(parsedUrl.searchParams.get("costValue")).toEqual("15");
    expect(parsedUrl.searchParams.get("profile")).toEqual("pedestrian");
    expect(parsedUrl.searchParams.get("timeUnit")).toEqual("minute");
    expect(parsedUrl.searchParams.get("distanceUnit")).toEqual("meter");
    expect(parsedUrl.searchParams.get("crs")).toEqual("EPSG:4326");
    expect(parsedUrl.searchParams.get("geometryFormat")).toEqual("geojson");
  });

  it("should reject responses without usable GeoJSON geometry", async () => {
    const client = new NavigationIsochroneClient(
      new RateLimiter({ name: "test", maxCalls: 100, period: 1 }),
      async () => ({ geometry: null }),
    );

    await expect(client.getTravelTimeGeometry({
      lon: 2.337306,
      lat: 48.849319,
      minutes: 15,
      profile: "car",
    })).rejects.toThrow("géométrie GeoJSON exploitable");
  });
});
