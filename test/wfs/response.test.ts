import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { intersect } from "@turf/intersect";
import { feature as turfFeature, featureCollection } from "@turf/helpers";
import type { Geometry, MultiPolygon, Polygon } from "geojson";
import area from "../../src/helpers/area";

import {
  mapToFlatItems,
  mapToFlatItemsWithGeometry,
  transformFeatureCollectionResponse,
  postProcessFeatureCollection,
} from "../../src/wfs/response";
import { type SpatialExtraOptions } from "../../src/wfs/schema";

describe("wfs_engine/response", () => {
  function getFeatures(
    result: ReturnType<typeof transformFeatureCollectionResponse>,
  ): NonNullable<ReturnType<typeof transformFeatureCollectionResponse>["features"]> {
    expect(result.features).toBeDefined();
    return result.features!;
  }

  // --- transformFeatureCollectionResponse ---

  describe("transformFeatureCollectionResponse", () => {
    it("should pass through a FeatureCollection without a features array", () => {
      const featureCollection = { type: "FeatureCollection", totalFeatures: 0 };
      const input = { typename: "TEST:type", spatial_extras: [] };
      expect(transformFeatureCollectionResponse(featureCollection, input)).toEqual(featureCollection);
    });

    it("should remove geometry and geometry_name, set geometry to null, and add feature_ref", () => {
      const result = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "EPSG:4326" } },
        features: [
          {
            id: "commune.1",
            geometry: { type: "Point", coordinates: [2.35, 48.85] },
            geometry_name: "geometrie",
            properties: { code_insee: "94080" },
          },
        ],
      }, { typename: "TEST:type", spatial_extras: [] });

      expect(result).not.toHaveProperty("crs");
      const features = getFeatures(result);

      expect(features).toHaveLength(1);
      expect(features[0]).toEqual({
        id: "commune.1",
        properties: { code_insee: "94080" },
        geometry: null,
        feature_ref: { typename: null, feature_id: "commune.1" },
      });
    });

    it("should not add feature_ref when feature id is not a string", () => {
      const result = transformFeatureCollectionResponse({
        features: [
          { id: 42, properties: { name: "test" } },
        ],
      }, { typename: "TEST:type", spatial_extras: [] });

      const features = getFeatures(result);

      expect(features[0]).not.toHaveProperty("feature_ref");
      expect(features[0]).toEqual({
        id: 42,
        properties: { name: "test" },
        geometry: null,
      });
    });

    it("should return a GeometryCollection with bbox when only bbox is requested", () => {
      const result = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [
          {
            id: "commune.1",
            geometry: {
              type: "Polygon",
              coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.9], [2.3, 48.8]]],
            },
            geometry_name: "geometrie",
            properties: { code_insee: "94080" },
          },
        ],
      }, { typename: "TEST:type", spatial_extras: ["bbox"] });

      const features = getFeatures(result);

      expect(features[0].bbox).toStrictEqual([2.3, 48.8, 2.4, 48.9]);
    });

    it("should return centroid and bbox in spatial_extras when requested", () => {
      const result = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [
          {
            id: "commune.1",
            geometry: {
              type: "Polygon",
              coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.9], [2.3, 48.8]]],
            },
            geometry_name: "geometrie",
            properties: { code_insee: "94080" },
          },
        ],
      }, { typename: "TEST:type", spatial_extras: ["centroid", "bbox"] });

      const features = getFeatures(result);
      expect(features[0].bbox).toStrictEqual([2.3, 48.8, 2.4, 48.9]);
      const features0centroid = features[0] as { centroid?: { lon: number; lat: number } };
      expect(features0centroid.centroid?.lon).toBeCloseTo(2.35);
      expect(features0centroid.centroid?.lat).toBeCloseTo(48.85);
    });

    it("should compute length on linear geometries and area on surface geometries", () => {
      const lineResult = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [
          {
            id: "line.1",
            geometry: {
              type: "LineString",
              coordinates: [[2.3, 48.8], [2.31, 48.81]],
            },
            properties: { name: "line" },
          },
        ],
      }, { typename: "TEST:type", spatial_extras: ["length", "area"] });

      const lineFeatures = getFeatures(lineResult);
      expect(lineFeatures[0].length as number).toBeCloseTo(1331.4584991460265, 6);
      expect(lineFeatures[0].area).toBeNull();

      const polygonResult = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [
          {
            id: "poly.1",
            geometry: {
              type: "Polygon",
              coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.9], [2.3, 48.8]]],
            },
            properties: { name: "poly" },
          },
        ],
      }, { typename: "TEST:type", spatial_extras: ["length", "area"] });

      const polygonFeatures = getFeatures(polygonResult);
      expect(polygonFeatures[0].length).toBeNull();
      expect(polygonFeatures[0].area as number).toBeCloseTo(81361415.96674393, 6);
    });

    it("should compute non-zero distance_to_filter_center and intersection_area when a spatial filter is provided", () => {
      const result = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [
          {
            id: "poly.1",
            geometry: {
              type: "Polygon",
              coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.9], [2.3, 48.8]]],
            },
            properties: { name: "poly" },
          },
        ],
      }, {
        typename: "TEST:type",
        spatial_extras: ["distance_to_filter_center", "intersection_area"],
        bbox_filter: {
          west: 2.36,
          south: 48.86,
          east: 2.46,
          north: 48.96,
        },
      });

      const features = getFeatures(result);
      expect(features[0].distance_to_filter_center as number).toBeCloseTo(1330.65, 3);
      expect(features[0].intersection_area as number).toBeCloseTo(13010026.445506852, 3);
    });

    it("should compute non-zero distance_to_filter_center for an off-center point in a bbox filter", () => {
      const result = transformFeatureCollectionResponse({
        type: "FeatureCollection",
        features: [
          {
            id: "point.1",
            geometry: {
              type: "Point",
              coordinates: [2.39, 48.88],
            },
            properties: { name: "offcenter" },
          },
        ],
      }, {
        typename: "TEST:type",
        spatial_extras: ["distance_to_filter_center"],
        bbox_filter: {
          west: 2.3,
          south: 48.8,
          east: 2.5,
          north: 49.0,
        },
      });

      const features = getFeatures(result);
      expect(features[0].distance_to_filter_center as number).toBeCloseTo(2340.99, 3);
    });

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

    // Regression: `dwithin_point` used to short-circuit `intersection_area` and
    // return the feature's own geometry, on the false premise that a DWITHIN
    // match implies containment. DWITHIN matches as soon as ANY part of the
    // geometry lies within `distance_m`, so the intersection must be computed.
    describe("intersection_area with a dwithin_point filter", () => {
      const dwithin_point_filter = { lon: 2.0, lat: 48.0, distance_m: 100 };

      /** Area of the disc approximated by the filter: the hard ceiling for any
       * `intersection_area` computed against it. */
      const DISC_AREA = 31365.484904902078;

      function deriveExtras(geometry: unknown, spatial_extras: string[]) {
        const result = transformFeatureCollectionResponse({
          type: "FeatureCollection",
          features: [{ id: "poly.1", geometry, properties: { name: "poly" } }],
        }, {
          typename: "TEST:type",
          spatial_extras,
          dwithin_point_filter,
        } as Parameters<typeof transformFeatureCollectionResponse>[1]);

        return getFeatures(result)[0];
      }

      // South-west corner on the filter centre: covers one quadrant of the disc
      // and extends far beyond it.
      const quadrantPolygon = {
        type: "Polygon",
        coordinates: [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]],
      };

      it("should clip a partially overlapping geometry to the filter disc", () => {
        const feature = deriveExtras(quadrantPolygon, ["area", "intersection_area"]);

        expect(feature.intersection_area as number).toBeLessThanOrEqual(DISC_AREA);
        expect(feature.intersection_area as number).toBeLessThan(feature.area as number);
        // The polygon covers exactly one of the disc's four quadrants.
        expect((feature.intersection_area as number) / DISC_AREA).toBeCloseTo(0.25, 2);
      });

      it("should return the geometry's own area when it is fully inside the filter disc", () => {
        // Not a rectangle, whose triangles happen to add up exactly to its area.
        const containedPolygon = {
          type: "Polygon",
          coordinates: [[[2.0003, 48], [2.0001, 48.0003], [1.9997, 48.0002], [1.9997, 47.9998], [2.0001, 47.9997], [2.0003, 48]]],
        };

        const feature = deriveExtras(containedPolygon, ["area", "intersection_area"]);

        expect(feature.intersection_area).toEqual(feature.area);
        expect(feature.intersection_area as number).toBeLessThanOrEqual(DISC_AREA);
      });

      it("should return 0 for a geometry disjoint from the filter disc", () => {
        const disjointPolygon = {
          type: "Polygon",
          coordinates: [[[10, 48], [10.1, 48], [10.1, 48.1], [10, 48.1], [10, 48]]],
        };

        expect(deriveExtras(disjointPolygon, ["intersection_area"]).intersection_area).toEqual(0);
      });

      it("should still compute distance_to_filter_center alongside intersection_area", () => {
        const feature = deriveExtras(quadrantPolygon, ["distance_to_filter_center", "intersection_area"]);

        expect(feature.distance_to_filter_center).toEqual(0);
        expect(feature.intersection_area as number).toBeLessThanOrEqual(DISC_AREA);
      });
    });

    it("should compute intersection_area over a bbox filter that clips part of a MultiPolygon away", () => {
      const insideRing = [[2, 48], [2.1, 48], [2.1, 48.1], [2, 48.1], [2, 48]];
      const outsideRing = [[5, 48], [5.1, 48], [5.1, 48.1], [5, 48.1], [5, 48]];
      const bbox_filter = { west: 1.9, south: 47.9, east: 2.2, north: 48.2 };

      function intersectionArea(coordinates: number[][][][]) {
        const result = transformFeatureCollectionResponse({
          type: "FeatureCollection",
          features: [{
            id: "poly.1",
            geometry: { type: "MultiPolygon", coordinates },
            properties: { name: "poly" },
          }],
        }, {
          typename: "TEST:type",
          spatial_extras: ["intersection_area"],
          bbox_filter,
        } as Parameters<typeof transformFeatureCollectionResponse>[1]);

        return getFeatures(result)[0].intersection_area as number;
      }

      // The clipped-away part must contribute nothing.
      expect(intersectionArea([[insideRing], [outsideRing]])).toBeCloseTo(
        intersectionArea([[insideRing]]), 3,
      );
      expect(intersectionArea([[outsideRing]])).toEqual(0);
    });

    // Contract shared by every extra: `null` when the value cannot be computed for
    // this feature, a number (`0` included) when the computation ran.
    describe("spatial_extras contract", () => {
      const square = [[2, 48], [2.1, 48], [2.1, 48.1], [2, 48.1], [2, 48]];
      const bbox_filter = { west: 1.9, south: 47.9, east: 2.2, north: 48.2 };
      const intersects_feature_filter = { typename: "REF:type", feature_id: "ref.1" };

      function derive(
        geometry: unknown,
        spatial_extras: string[],
        filters: Record<string, unknown> = {},
        resolvedGeometryRef?: Geometry,
      ) {
        const result = transformFeatureCollectionResponse({
          type: "FeatureCollection",
          features: [{ id: "f.1", geometry, properties: {} }],
        }, {
          typename: "TEST:type",
          spatial_extras,
          ...filters,
        } as Parameters<typeof transformFeatureCollectionResponse>[1], resolvedGeometryRef);

        return getFeatures(result)[0];
      }

      it.each([
        ["an absent geometry", undefined],
        ["a null geometry", null],
        ["an empty Point", { type: "Point", coordinates: [] }],
        ["an empty Polygon", { type: "Polygon", coordinates: [] }],
        ["an empty GeometryCollection", { type: "GeometryCollection", geometries: [] }],
      ])("should return null for every extra on %s", (_label, geometry) => {
        const feature = derive(
          geometry,
          ["centroid", "bbox", "length", "area", "distance_to_filter_center", "intersection_area"],
          { bbox_filter },
        );

        expect(feature).toMatchObject({
          centroid: null,
          bbox: null,
          length: null,
          area: null,
          distance_to_filter_center: null,
          intersection_area: null,
        });
      });

      it("should return null for intersection_area on a non-areal feature, like area", () => {
        const feature = derive(
          { type: "LineString", coordinates: [[2, 48], [2.1, 48.1]] },
          ["area", "intersection_area"],
          { bbox_filter },
        );

        expect(feature.area).toBeNull();
        expect(feature.intersection_area).toBeNull();
      });

      it("should return null for intersection_area when the intersects_feature reference is not areal", () => {
        const feature = derive(
          { type: "Polygon", coordinates: [square] },
          ["intersection_area"],
          { intersects_feature_filter },
          { type: "LineString", coordinates: [[1.9, 47.9], [2.2, 48.2]] },
        );

        expect(feature.intersection_area).toBeNull();
      });

      it("should return null for filter-dependent extras when the reference geometry could not be prepared", () => {
        const feature = derive(
          { type: "Polygon", coordinates: [square] },
          ["distance_to_filter_center", "intersection_area"],
          { intersects_feature_filter },
        );

        expect(feature.distance_to_filter_center).toBeNull();
        expect(feature.intersection_area).toBeNull();
      });

      it("should return 0 for intersection_area when both geometries are areal and do not overlap", () => {
        const farSquare = square.map(([lon, lat]) => [lon + 5, lat]);
        const feature = derive(
          { type: "Polygon", coordinates: [farSquare] },
          ["intersection_area"],
          { intersects_feature_filter },
          { type: "Polygon", coordinates: [square] },
        );

        expect(feature.intersection_area).toEqual(0);
      });
      it("should sum the linear parts of a GeometryCollection for length and ignore the other parts", () => {
        const line = { type: "LineString", coordinates: [[2.3, 48.8], [2.31, 48.81]] };
        const lineLength = derive(line, ["length"]).length as number;

        const feature = derive({
          type: "GeometryCollection",
          geometries: [line, line, { type: "Polygon", coordinates: [square] }],
        }, ["length"]);

        expect(feature.length as number).toBeCloseTo(2 * lineLength, 6);
      });

      it("should sum the polygons of a GeometryCollection for area, overlaps included, like JTS", () => {
        const shifted = square.map(([lon, lat]) => [lon + 0.05, lat]); // overlaps half of `square`
        const squareArea = derive({ type: "Polygon", coordinates: [square] }, ["area"]).area as number;

        const feature = derive({
          type: "GeometryCollection",
          geometries: [
            { type: "Polygon", coordinates: [square] },
            { type: "Polygon", coordinates: [shifted] },
          ],
        }, ["area"]);

        expect(feature.area as number).toBeCloseTo(2 * squareArea, 0);
      });

      it("should return null for length when a GeometryCollection has no usable linear part", () => {
        const feature = derive({
          type: "GeometryCollection",
          geometries: [
            { type: "Polygon", coordinates: [square] },
            { type: "LineString", coordinates: [] },
          ],
        }, ["length"]);

        expect(feature.length).toBeNull();
      });
    });

    describe("intersection_area with an intersects_feature filter", () => {
      function rectangle(west: number, south: number, east: number, north: number) {
        return [[west, south], [east, south], [east, north], [west, north], [west, south]];
      }

      const referenceSquare = { type: "Polygon" as const, coordinates: [rectangle(2, 48, 3, 49)] };

      const star: Polygon = {
        type: "Polygon",
        coordinates: [[
          [2.59, 48.5], [2.5697, 48.5071], [2.5693, 48.5285], [2.5563, 48.5114], [2.5357, 48.5176],
          [2.548, 48.5], [2.5357, 48.4824], [2.5563, 48.4886], [2.5693, 48.4715], [2.5697, 48.4929], [2.59, 48.5],
        ]],
      };

      function deriveExtras(geometry: unknown, referenceGeometry: Geometry = referenceSquare) {
        const result = transformFeatureCollectionResponse({
          type: "FeatureCollection",
          features: [{ id: "poly.1", geometry, properties: { name: "poly" } }],
        }, {
          typename: "TEST:type",
          spatial_extras: ["area", "intersection_area"],
          intersects_feature_filter: { typename: "TEST:region", feature_id: "region.1" },
        } as Parameters<typeof transformFeatureCollectionResponse>[1], referenceGeometry);

        return getFeatures(result)[0] as { area: number, intersection_area: number };
      }

      it("should return the geometry's own area when it is fully inside the reference", () => {
        // Not a rectangle, whose triangles happen to add up exactly to its area.
        const feature = deriveExtras(star);

        expect(feature.intersection_area).toEqual(feature.area);
      });

      it("should return the geometry's own area when it is inside the reference but not its bbox", () => {
        // The hypotenuse of the reference cuts the north-eastern corner of the bbox of the star, not the star.
        const reference = { type: "Polygon" as const, coordinates: [[[2, 48], [2.97, 48], [2, 49.3115], [2, 48]]] };
        const feature = deriveExtras(star, reference);

        expect(feature.intersection_area).toEqual(feature.area);
      });

      it("should clip a geometry crossing the reference boundary", () => {
        // Split in its middle by the eastern edge of the reference, which is a meridian.
        const feature = deriveExtras({ type: "Polygon", coordinates: [rectangle(2.9, 48.4, 3.1, 48.6)] });

        expect(feature.intersection_area / feature.area).toBeCloseTo(0.5, 9);
      });

      it("should return the reference's area for a geometry containing it", () => {
        const feature = deriveExtras({ type: "Polygon", coordinates: [rectangle(1, 47, 4, 50)] });

        expect(feature.intersection_area).toBeCloseTo(area(referenceSquare), 3);
      });

      it("should exclude the holes of the reference", () => {
        const hole = rectangle(2.4, 48.4, 2.6, 48.6);
        const referenceWithHole = { type: "Polygon" as const, coordinates: [rectangle(2, 48, 3, 49), hole] };
        const feature = deriveExtras({ type: "Polygon", coordinates: [rectangle(2.3, 48.3, 2.7, 48.7)] }, referenceWithHole);

        const holeArea = area({ type: "Polygon", coordinates: [hole] });
        expect(feature.intersection_area).toBeCloseTo(feature.area - holeArea, 3);
      });

      it("should sum the intersections with every part of a MultiPolygon reference", () => {
        const referenceMultiPolygon = {
          type: "MultiPolygon" as const,
          coordinates: [[rectangle(2, 48, 3, 49)], [rectangle(3.2, 48, 4, 49)]],
        };
        // Overlaps [2.9, 3] with the first part and [3.2, 3.3] with the second.
        const feature = deriveExtras({ type: "Polygon", coordinates: [rectangle(2.9, 48.4, 3.3, 48.6)] }, referenceMultiPolygon);

        expect(feature.intersection_area / feature.area).toBeCloseTo(0.5, 9);
      });

      it("should sum the intersections of every part of a MultiPolygon geometry", () => {
        // One part only touching the eastern edge of the reference, the other inside it.
        const inside = rectangle(2.4, 48.4, 2.6, 48.6);
        const feature = deriveExtras({ type: "MultiPolygon", coordinates: [[rectangle(3, 48.4, 3.2, 48.6)], [inside]] });

        // Not snapped to the area of the inside part: the MultiPolygon is integrated as a whole.
        expect(feature.intersection_area).toBeCloseTo(area({ type: "Polygon", coordinates: [inside] }), 3);
      });

      /** Area of the intersection computed by general polygon clipping, as a reference. */
      function polyclipIntersectionArea(geometry: Polygon | MultiPolygon, referenceGeometry: Polygon | MultiPolygon) {
        const inter = intersect(featureCollection([turfFeature(geometry), turfFeature(referenceGeometry)]));
        return inter == null ? 0 : area(inter.geometry);
      }

      it("should clip a non-convex geometry crossing the reference boundary", () => {
        // U shape whose both branches cross the eastern edge of the reference.
        const uShape: Polygon = {
          type: "Polygon",
          coordinates: [[[2.8, 48.4], [3.2, 48.4], [3.2, 48.45], [2.9, 48.45], [2.9, 48.55], [3.2, 48.55], [3.2, 48.6], [2.8, 48.6], [2.8, 48.4]]],
        };
        const feature = deriveExtras(uShape);

        expect(feature.intersection_area).toBeCloseTo(polyclipIntersectionArea(uShape, referenceSquare), 0);
      });

      it("should exclude the holes of the geometry", () => {
        const withHole: Polygon = {
          type: "Polygon",
          coordinates: [rectangle(2.8, 48.4, 3.2, 48.6), rectangle(2.9, 48.45, 3.1, 48.55)],
        };
        const feature = deriveExtras(withHole);

        expect(feature.intersection_area).toBeCloseTo(polyclipIntersectionArea(withHole, referenceSquare), 0);
      });

      it("should return null for a self-intersecting geometry", () => {
        // Bow tie, whose lobes cancel in its signed area.
        const bowTie: Polygon = {
          type: "Polygon",
          coordinates: [[[2.8, 48.4], [3.2, 48.6], [3.2, 48.4], [2.8, 48.6], [2.8, 48.4]]],
        };

        // Across the reference boundary, around its crossing point, and inside the reference.
        expect(deriveExtras(bowTie).intersection_area).toBeNull();
        const inWedge = { type: "Polygon" as const, coordinates: [rectangle(2.98, 48.41, 3.02, 48.43)] };
        expect(deriveExtras(bowTie, inWedge).intersection_area).toBeNull();
        const inside = { type: "Polygon" as const, coordinates: [rectangle(2, 48, 4, 49)] };
        expect(deriveExtras(bowTie, inside).intersection_area).toBeNull();
      });

      it("should return null for a self-intersecting reference", () => {
        const bowTie = { type: "Polygon" as const, coordinates: [[[2, 48], [3, 49], [3, 48], [2, 49], [2, 48]]] };
        const feature = deriveExtras({ type: "Polygon", coordinates: [rectangle(2.1, 48.1, 2.9, 48.4)] }, bowTie);

        expect(feature.intersection_area).toBeNull();
      });

      it("should return null for a non-areal geometry", () => {
        const feature = deriveExtras({ type: "LineString", coordinates: [[2.5, 48.5], [3.5, 48.5]] });

        expect(feature.intersection_area).toBeNull();
      });

      it("should clip a non-convex geometry crossing a non-convex reference boundary", () => {
        // Notch on the eastern side of the reference, whose tip lies inside the star.
        const notchedReference: Polygon = {
          type: "Polygon",
          coordinates: [[[2.4, 48.4], [2.6, 48.4], [2.55, 48.5], [2.6, 48.6], [2.4, 48.6], [2.4, 48.4]]],
        };
        const feature = deriveExtras(star, notchedReference);

        expect(feature.intersection_area / feature.area).toBeCloseTo(0.2856, 4);
        expect(Math.abs(feature.intersection_area - polyclipIntersectionArea(star, notchedReference))).toBeLessThanOrEqual(1e-6 * feature.area);
      });

      it("should stay precise on long thin geometries crossing a winding reference boundary", () => {
        // Clipping leaves zero-width spikes along the long triangles of such geometries,
        // which must not contribute to the area.
        const winding = Array.from({ length: 500 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 500;
          const radius = 0.2 * (1 + 0.05 * Math.sin(53 * angle));
          return [2.5 + radius * Math.cos(angle), 48.5 + radius * Math.sin(angle)];
        });
        const reference: Polygon = { type: "Polygon", coordinates: [[...winding, winding[0]]] };

        // 10 km long and 20 m wide diagonal strip, with a vertex every 100 m, centered on the boundary.
        const side = (offset: number) => Array.from({ length: 101 }, (_, index) => {
          const along = -0.032 + (0.064 * index) / 100;
          return [2.7 + along - offset, 48.5 + along + offset];
        });
        const ring = [...side(0.00007), ...side(-0.00007).reverse()];
        const strip: Polygon = { type: "Polygon", coordinates: [[...ring, ring[0]]] };

        const feature = deriveExtras(strip, reference);

        const expected = polyclipIntersectionArea(strip, reference);
        expect(Math.abs(feature.intersection_area - expected)).toBeLessThanOrEqual(1e-6 * feature.area);
      });

      it("should handle geometries smaller than the deepest tile of the reference", () => {
        // About 1 cm wide, inside the reference and in an empty tile outside it.
        const tinySquare = (lon: number, lat: number) => ({ type: "Polygon", coordinates: [rectangle(lon, lat, lon + 1e-7, lat + 1e-7)] });
        const inside = deriveExtras(tinySquare(2.5, 48.5));

        expect(Math.abs(inside.intersection_area - inside.area)).toBeLessThanOrEqual(1e-6 * inside.area);
        expect(deriveExtras(tinySquare(3.5, 48.5)).intersection_area).toEqual(0);
      });
    });
  });

  // --- postProcessFeatureCollection ---

  describe("postProcessFeatureCollection", () => {
    it("should pass through when transformed result has no features array", () => {
      const input = { type: "FeatureCollection" };
      const result = postProcessFeatureCollection(input, { typename: "TEST:type", spatial_extras: [] });
      expect(result).toEqual({ type: "FeatureCollection" });
    });

    it("should inject typename into feature_ref for features with string id", () => {
      const result = postProcessFeatureCollection(
        {
          features: [
            { id: "commune.1", geometry: { type: "Point", coordinates: [2.35, 48.85] }, properties: { nom: "Test" } },
          ],
        },
        { typename: "ADMINEXPRESS-COG.LATEST:commune", spatial_extras: [] }
      );

      const features = getFeatures(result);

      expect(features[0].feature_ref).toEqual({
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      });
    });

    it("should skip features without feature_ref (non-string id)", () => {
      const result = postProcessFeatureCollection(
        {
          features: [
            { id: 42, properties: { name: "no-string-id" } },
          ],
        },
        { typename: "TEST:type", spatial_extras: ["bbox"] }
      );

      const features = getFeatures(result);

      expect(features[0]).not.toHaveProperty("feature_ref");
      // check that an impossible-to compute spatial_extra is returned as null
      expect(features[0].bbox).toStrictEqual(null);
    });

    it("should inject typename into feature_ref for multiple features", () => {
      const result = postProcessFeatureCollection(
        {
          features: [
            { id: "commune.1", geometry: null, properties: { nom: "A" } },
            { id: "commune.2", geometry: null, properties: { nom: "B" } },
            { id: 42, properties: { nom: "C" } },
          ],
        },
        { typename: "ADMINEXPRESS-COG.LATEST:commune", spatial_extras: [] },
      );

      const features = getFeatures(result);

      expect(features).toHaveLength(3);
      expect(features[0].feature_ref).toEqual({
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      });
      expect(features[1].feature_ref).toEqual({
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.2",
      });
      // Non-string id: no feature_ref injected
      expect(features[2]).not.toHaveProperty("feature_ref");
    });
  });

  // --- mapToFlatItems / mapToFlatItemsWithGeometry ---

  it("should map a FeatureCollection to flat items with resolved feature_ref", () => {
    const items = mapToFlatItems(
      {
        features: [
          {
            id: "commune.1",
            geometry: { type: "Point", coordinates: [2.35, 48.85] },
            geometry_name: "geometrie",
            bbox: [2.3, 48.8, 2.4, 48.9],
            properties: {
              code_insee: "94080",
              nom: "Vitry-sur-Seine",
            },
            source_tag: "test",
          },
          {
            id: "unknown_layer.2",
            properties: {
              label: "No typename match",
            },
          },
          {
            properties: {
              label: "Missing id",
            },
          },
        ],
      },
      ["ADMINEXPRESS-COG.LATEST:commune"],
    );

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      type: "commune",
      id: "commune.1",
      bbox: [2.3, 48.8, 2.4, 48.9],
      code_insee: "94080",
      nom: "Vitry-sur-Seine",
      source_tag: "test",
      feature_ref: {
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      },
    });
    expect(items[1]).toMatchObject({
      type: "unknown_layer",
      id: "unknown_layer.2",
      label: "No typename match",
    });
    expect(items[1]).not.toHaveProperty("feature_ref");
    expect(items[2]).toMatchObject({
      type: "unknown",
      id: "unknown",
      label: "Missing id",
    });
  });

  it("should preserve _rawGeometry in mapToFlatItemsWithGeometry", () => {
    const items = mapToFlatItemsWithGeometry(
      {
        features: [
          {
            id: "localisant.8",
            geometry: { type: "Point", coordinates: [2.31, 48.84] },
            properties: { idu: "AA0001" },
          },
          {
            id: "localisant.9",
            geometry: null,
            properties: { idu: "AA0002" },
          },
        ],
      },
      ["CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant"],
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: "localisant",
      id: "localisant.8",
      idu: "AA0001",
      feature_ref: {
        typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
        feature_id: "localisant.8",
      },
      _rawGeometry: { type: "Point", coordinates: [2.31, 48.84] },
    });
    expect(items[1]).toMatchObject({
      type: "localisant",
      id: "localisant.9",
      idu: "AA0002",
      _rawGeometry: null,
    });
  });

  it("should return an empty list when features are missing", () => {
    expect(mapToFlatItems({}, ["ADMINEXPRESS-COG.LATEST:commune"])).toEqual([]);
    expect(mapToFlatItemsWithGeometry({}, ["ADMINEXPRESS-COG.LATEST:commune"])).toEqual([]);
  });
});
