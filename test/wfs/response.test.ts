import { describe, expect, it } from "vitest";

import {
  mapToFlatItems,
  mapToFlatItemsWithGeometry,
  transformFeatureCollectionResponse,
  postProcessFeatureCollection,
} from "../../src/wfs/response";

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
      expect(polygonFeatures[0].area as number).toBeCloseTo(81361416.69722056, 6);
    });

    it("should compute non-zero distance_to_filter and intersection_area when a spatial filter is provided", () => {
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
        spatial_extras: ["distance_to_filter", "intersection_area"],
        bbox_filter: {
          west: 2.36,
          south: 48.86,
          east: 2.46,
          north: 48.96,
        },
      });

      const features = getFeatures(result);
      expect(features[0].distance_to_filter as number).toBeCloseTo(1330.6551992128234, 6);
      expect(features[0].intersection_area as number).toBeCloseTo(13010026.562313082, 6);
    });

    it("should compute non-zero distance_to_filter for an off-center point in a bbox filter", () => {
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
        spatial_extras: ["distance_to_filter"],
        bbox_filter: {
          west: 2.3,
          south: 48.8,
          east: 2.5,
          north: 49.0,
        },
      });

      const features = getFeatures(result);
      expect(features[0].distance_to_filter as number).toBeCloseTo(2340.9971606708805, 6);
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
        const containedPolygon = {
          type: "Polygon",
          coordinates: [[
            [1.9999, 47.9999], [2.0001, 47.9999], [2.0001, 48.0001], [1.9999, 48.0001], [1.9999, 47.9999],
          ]],
        };

        const feature = deriveExtras(containedPolygon, ["area", "intersection_area"]);

        expect(feature.intersection_area as number).toBeCloseTo(feature.area as number, 6);
        expect(feature.intersection_area as number).toBeLessThanOrEqual(DISC_AREA);
      });

      it("should return 0 for a geometry disjoint from the filter disc", () => {
        const disjointPolygon = {
          type: "Polygon",
          coordinates: [[[10, 48], [10.1, 48], [10.1, 48.1], [10, 48.1], [10, 48]]],
        };

        expect(deriveExtras(disjointPolygon, ["intersection_area"]).intersection_area).toEqual(0);
      });

      it("should still compute distance_to_filter alongside intersection_area", () => {
        const feature = deriveExtras(quadrantPolygon, ["distance_to_filter", "intersection_area"]);

        expect(feature.distance_to_filter).toEqual(0);
        expect(feature.intersection_area as number).toBeLessThanOrEqual(DISC_AREA);
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
