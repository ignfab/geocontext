import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { intersect } from "@turf/intersect";
import { feature as turfFeature, featureCollection } from "@turf/helpers";
import type { Polygon } from "geojson";
import area from "../../src/helpers/area";

import { transformFeatureCollectionResponse } from "../../src/wfs/response";
import { type SpatialExtraOptions } from "../../src/wfs/schema";

describe("wfs_engine/response", () => {
  function getFeatures(
    result: ReturnType<typeof transformFeatureCollectionResponse>,
  ): NonNullable<ReturnType<typeof transformFeatureCollectionResponse>["features"]> {
    expect(result.features).toBeDefined();
    return result.features!;
  }

  describe("transformFeatureCollectionResponse", () => {
    it("should stay fast when computing centroid, area, and intersection_area for a large region against many polygons crossing its boundary", () => {
      const regionCenterLon = 2.35;
      const regionCenterLat = 48.85;
      const regionVertices = 3000;
      const polygonSides = 20;
      const featureCount = 5000;

      /** Close a ring by repeating its first position, as GeoJSON requires. */
      function closeRing<T>(positions: T[]) {
        return [...positions, positions[0]];
      }

      function regularRing(centerLon: number, centerLat: number, radius: number, sides: number) {
        return closeRing(Array.from({ length: sides }, (_, index) => {
          const angle = (Math.PI * 2 * index) / sides - Math.PI / 2;
          return [centerLon + radius * Math.cos(angle), centerLat + radius * Math.sin(angle)] as [number, number];
        }));
      }

      /** Position on the region boundary at the given angle from its center. */
      function regionBoundary(angle: number) {
        const radius = 0.22 + 0.03 * Math.sin(7 * angle);
        return [
          regionCenterLon + radius * Math.cos(angle),
          regionCenterLat + radius * Math.sin(angle),
        ];
      }

      const regionGeometry = {
        type: "Polygon" as const,
        coordinates: [
          closeRing(Array.from({ length: regionVertices }, (_, index) => regionBoundary((Math.PI * 2 * index) / regionVertices))),
        ],
      };

      // Every polygon is centered on the region boundary, so that each one needs
      // an actual intersection to be computed.
      const featureCollection = {
        type: "FeatureCollection",
        features: Array.from({ length: featureCount }, (_, index) => {
          const [centerLon, centerLat] = regionBoundary((Math.PI * 2 * index) / featureCount);
          const radius = 0.002 + (index % 7) * 0.00025;

          return {
            id: `poly.${index}`,
            geometry: {
              type: "Polygon",
              coordinates: [regularRing(centerLon, centerLat, radius, polygonSides)],
            },
            properties: { name: `poly-${index}` },
          };
        }),
      };

      const input = {
        typename: "TEST:type",
        spatial_extras: ["centroid", "area", "intersection_area"] as SpatialExtraOptions[],
        intersects_feature_filter: {
          typename: "TEST:region",
          feature_id: "region.1",
        },
      };

      const start = performance.now();
      const result = transformFeatureCollectionResponse(featureCollection, input, regionGeometry);
      const elapsedMs = performance.now() - start;

      const features = getFeatures(result);
      expect(features).toHaveLength(featureCount);
      expect(features[0].centroid).toMatchObject({ lon: expect.any(Number), lat: expect.any(Number) });
      const notPartiallyIntersecting = features.filter((feature) => !(
        typeof feature.intersection_area === "number"
        && feature.intersection_area > 0
        && feature.intersection_area < (feature.area as number)
      ));
      expect(notPartiallyIntersecting).toEqual([]);
      expect(elapsedMs).toBeLessThan(1000);
    });

    it("should stay fast when computing intersection_area for a large geometry with holes crossing a detailed reference boundary", () => {
      // Like a forest with clearings across the boundary of an isochrone: both
      // geometries have many positions in the same place, which used to cost
      // their product (over a second here).
      function wavyRing(centerLon: number, centerLat: number, radius: number, vertices: number, waves: number) {
        const positions = Array.from({ length: vertices }, (_, index) => {
          const angle = (Math.PI * 2 * index) / vertices;
          const wavyRadius = radius * (1 + 0.02 * Math.sin(waves * angle));
          return [centerLon + wavyRadius * Math.cos(angle), centerLat + wavyRadius * Math.sin(angle)];
        });
        return [...positions, positions[0]];
      }

      const reference: Polygon = { type: "Polygon", coordinates: [wavyRing(2.35, 48.85, 0.3, 20000, 200)] };
      // Centered on the eastern boundary of the reference, with clearings on a grid.
      const clearings = Array.from({ length: 100 }, (_, index) => [2.65 + 0.014 * (index % 10 - 4.5), 48.85 + 0.014 * (Math.floor(index / 10) - 4.5)])
        .filter(([lon, lat]) => Math.hypot(lon - 2.65, lat - 48.85) < 0.08)
        .map(([lon, lat]) => wavyRing(lon, lat, 0.003, 16, 3).reverse());
      const forest: Polygon = { type: "Polygon", coordinates: [wavyRing(2.65, 48.85, 0.1, 20000, 300), ...clearings] };

      const start = performance.now();
      const result = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [{ id: "forest.1", geometry: forest, properties: {} }],
      }, {
        typename: "TEST:type",
        spatial_extras: ["intersection_area"],
        intersects_feature_filter: { typename: "TEST:region", feature_id: "region.1" },
      }, reference);
      const elapsedMs = performance.now() - start;

      const inter = intersect(featureCollection([turfFeature(forest), turfFeature(reference)]));
      expect(getFeatures(result)[0].intersection_area as number).toBeCloseTo(area(inter!.geometry), 3);
      expect(elapsedMs).toBeLessThan(300);
    });
  });
});
