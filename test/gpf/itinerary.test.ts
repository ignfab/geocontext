import { describe, expect, it } from "vitest";
import { NavigationItineraryLayerClient } from "../../src/gpf/itinerary.js";
import { RateLimiter } from "../../src/helpers/RateLimiter.js";

describe("NavigationItineraryLayerClient", () => {
  const ROUTE_GEOMETRY = {
    type: "LineString",
    coordinates: [[3.274356, 49.839862], [3.623693, 49.564267]],
  };

  type RawResponse = { geometry?: unknown; distance?: unknown; duration?: unknown };

  function buildClient(fetcher: (url: string) => Promise<RawResponse>) {
    return new NavigationItineraryLayerClient(
      new RateLimiter({ name: "test", maxCalls: 100, period: 1 }),
      fetcher,
    );
  }

  it("should request a GeoJSON geometry and return it with distance and duration", async () => {
    const urls: string[] = [];
    const client = buildClient(async (url) => {
      urls.push(url);
      return { geometry: ROUTE_GEOMETRY, distance: 48231, duration: 42 };
    });

    const result = await client.getItineraryWithGeometry({
      departure: { lon: 3.274356, lat: 49.839862 },
      arrival: { lon: 3.623693, lat: 49.564267 },
      profile: "car",
    });

    expect(result).toEqual({
      geometry: ROUTE_GEOMETRY,
      distance: 48231,
      duration: 42,
    });

    const parsedUrl = new URL(urls[0]);
    expect(parsedUrl.origin + parsedUrl.pathname).toEqual("https://data.geopf.fr/navigation/itineraire");
    expect(parsedUrl.searchParams.get("resource")).toEqual("bdtopo-osrm");
    expect(parsedUrl.searchParams.get("start")).toEqual("3.274356,49.839862");
    expect(parsedUrl.searchParams.get("end")).toEqual("3.623693,49.564267");
    expect(parsedUrl.searchParams.get("profile")).toEqual("car");
    expect(parsedUrl.searchParams.get("optimization")).toEqual("fastest");
    expect(parsedUrl.searchParams.get("timeUnit")).toEqual("minute");
    expect(parsedUrl.searchParams.get("distanceUnit")).toEqual("meter");
    expect(parsedUrl.searchParams.get("crs")).toEqual("EPSG:4326");
    // The layer client needs the geometry itself, unlike the plain client.
    expect(parsedUrl.searchParams.get("geometryFormat")).toEqual("geojson");
    expect(parsedUrl.searchParams.get("getSteps")).toEqual("false");
    expect(parsedUrl.searchParams.get("getBbox")).toEqual("false");
  });

  it("should optimize for distance when `optimize` is `distance`", async () => {
    const urls: string[] = [];
    const client = buildClient(async (url) => {
      urls.push(url);
      return { geometry: ROUTE_GEOMETRY, distance: 48231, duration: 42 };
    });

    await client.getItineraryWithGeometry({
      departure: { lon: 3.274356, lat: 49.839862 },
      arrival: { lon: 3.623693, lat: 49.564267 },
      profile: "pedestrian",
      optimize: "distance",
    });

    const parsedUrl = new URL(urls[0]);
    expect(parsedUrl.searchParams.get("optimization")).toEqual("shortest");
    expect(parsedUrl.searchParams.get("profile")).toEqual("pedestrian");
  });

  it("should reject responses without an exploitable GeoJSON geometry", async () => {
    const client = buildClient(async () => ({ distance: 48231, duration: 42 }));

    await expect(client.getItineraryWithGeometry({
      departure: { lon: 3.274356, lat: 49.839862 },
      arrival: { lon: 3.623693, lat: 49.564267 },
      profile: "car",
    })).rejects.toThrow(/n'a pas renvoyé de géométrie GeoJSON/);
  });

  it("should reject responses without a numeric distance and duration", async () => {
    const client = buildClient(async () => ({ geometry: ROUTE_GEOMETRY, distance: 48231 }));

    await expect(client.getItineraryWithGeometry({
      departure: { lon: 3.274356, lat: 49.839862 },
      arrival: { lon: 3.623693, lat: 49.564267 },
      profile: "car",
    })).rejects.toThrow(/n'a pas renvoyé de distance et de durée/);
  });
});
