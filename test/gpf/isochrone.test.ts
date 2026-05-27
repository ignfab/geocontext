import { describe, expect, it } from "vitest";

import {
  buildIsochroneRequest,
  getIsochrone,
  ISOCHRONE_URL,
  normalizeIsochroneResponse,
  toIsochroneRequestPayload,
} from "../../src/gpf/isochrone.js";
import { paris } from "../samples";

const rawIsochroneResponse = {
  point: "2.333333,48.866667",
  resource: "bdtopo-valhalla",
  resourceVersion: "2026-05-18",
  costType: "distance",
  costValue: 500,
  distanceUnit: "meter",
  profile: "pedestrian",
  direction: "departure",
  crs: "EPSG:4326",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [2.33, 48.86],
        [2.34, 48.86],
        [2.34, 48.87],
        [2.33, 48.87],
        [2.33, 48.86],
      ],
    ],
  },
  constraints: [],
};

function parseQuery(url: string) {
  const parsedUrl = new URL(url);
  return Object.fromEntries(parsedUrl.searchParams.entries());
}

describe("Test GeoPlateforme isochrone service wrapper", () => {
  it("should build a request with stable defaults", () => {
    const c = paris.coordinates;
    const request = buildIsochroneRequest({
      lon: c[0],
      lat: c[1],
      cost_type: "distance",
      cost_value: 500,
    });

    expect(request).toMatchObject({
      method: "GET",
      url: ISOCHRONE_URL,
      body: "",
    });
    expect(request.query).toMatchObject({
      resource: "bdtopo-valhalla",
      point: "2.333333,48.866667",
      costType: "distance",
      costValue: "500",
      profile: "pedestrian",
      direction: "departure",
      distanceUnit: "meter",
      timeUnit: "second",
      crs: "EPSG:4326",
      geometryFormat: "geojson",
    });
    expect(parseQuery(request.get_url)).toMatchObject(request.query);
  });

  it("should expose a compact request payload", () => {
    const c = paris.coordinates;
    const payload = toIsochroneRequestPayload(buildIsochroneRequest({
      lon: c[0],
      lat: c[1],
      cost_type: "time",
      cost_value: 900,
    }));

    expect(payload).toMatchObject({
      result_type: "request",
      method: "GET",
      url: ISOCHRONE_URL,
      body: "",
    });
    expect(payload.get_url).toContain("costType=time");
  });

  it("should serialize optional constraints for the upstream API", () => {
    const c = paris.coordinates;
    const request = buildIsochroneRequest({
      lon: c[0],
      lat: c[1],
      cost_type: "distance",
      cost_value: 500,
      constraints: [
        {
          constraint_type: "banned",
          key: "waytype",
          operator: "=",
          value: "autoroute",
        },
      ],
    });

    expect(request.query.constraints).toEqual(JSON.stringify({
      constraintType: "banned",
      key: "waytype",
      operator: "=",
      value: "autoroute",
    }));
    expect(parseQuery(request.get_url).constraints).toEqual(request.query.constraints);
  });

  it("should normalize the upstream response into a single-feature FeatureCollection", async () => {
    const c = paris.coordinates;
    const requestedUrls: string[] = [];
    const result = await getIsochrone({
      lon: c[0],
      lat: c[1],
      cost_type: "distance",
      cost_value: 500,
    }, async (url) => {
      requestedUrls.push(url);
      return rawIsochroneResponse;
    });

    expect(requestedUrls).toHaveLength(1);
    expect(parseQuery(requestedUrls[0])).toMatchObject({
      resource: "bdtopo-valhalla",
      geometryFormat: "geojson",
    });
    expect(result).toMatchObject({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: rawIsochroneResponse.geometry,
          properties: {
            point: "2.333333,48.866667",
            resource: "bdtopo-valhalla",
            resourceVersion: "2026-05-18",
            costType: "distance",
            costValue: 500,
            distanceUnit: "meter",
            timeUnit: "second",
            profile: "pedestrian",
            direction: "departure",
            crs: "EPSG:4326",
          },
        },
      ],
    });
  });

  it("should fill response metadata from input when upstream omits optional fields", () => {
    const c = paris.coordinates;
    const result = normalizeIsochroneResponse({
      geometry: rawIsochroneResponse.geometry,
    }, {
      lon: c[0],
      lat: c[1],
      cost_type: "time",
      cost_value: 900,
    });

    expect(result.features[0].properties).toMatchObject({
      point: "2.333333,48.866667",
      resource: "bdtopo-valhalla",
      costType: "time",
      costValue: 900,
      distanceUnit: "meter",
      timeUnit: "second",
      profile: "pedestrian",
      direction: "departure",
      crs: "EPSG:4326",
    });
  });

  it("should throw when upstream returns no geometry", () => {
    const c = paris.coordinates;
    expect(() => normalizeIsochroneResponse({}, {
      lon: c[0],
      lat: c[1],
      cost_type: "distance",
      cost_value: 500,
    })).toThrow("Le service d'isochrone n'a renvoyé aucune géométrie.");
  });

  it("should throw when upstream geometry is not GeoJSON", () => {
    const c = paris.coordinates;
    expect(() => normalizeIsochroneResponse({
      geometry: "POLYGON EMPTY",
    }, {
      lon: c[0],
      lat: c[1],
      cost_type: "distance",
      cost_value: 500,
    })).toThrow("La géométrie renvoyée par le service d'isochrone est invalide.");
  });
});
