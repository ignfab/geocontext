import {
  mapToFlatItems,
  mapToFlatItemsWithGeometry,
  transformFeatureCollectionResponse,
  attachFeatureRefs,
} from "../../../src/helpers/wfs_engine/response";

describe("wfs_engine/response", () => {
  // --- transformFeatureCollectionResponse ---

  describe("transformFeatureCollectionResponse", () => {
    it("should pass through a FeatureCollection without a features array", () => {
      const input = { type: "FeatureCollection", totalFeatures: 0 };
      expect(transformFeatureCollectionResponse(input)).toEqual(input);
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
      });

      expect(result).not.toHaveProperty("crs");
      expect(result.features).toHaveLength(1);
      expect(result.features[0]).toEqual({
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
      });

      expect(result.features[0]).not.toHaveProperty("feature_ref");
      expect(result.features[0]).toEqual({
        id: 42,
        properties: { name: "test" },
        geometry: null,
      });
    });
  });

  // --- attachFeatureRefs ---

  describe("attachFeatureRefs", () => {
    it("should pass through when transformed result has no features array", () => {
      const input = { type: "FeatureCollection" };
      const result = attachFeatureRefs(input, "TEST:type");
      expect(result).toEqual({ type: "FeatureCollection" });
    });

    it("should inject typename into feature_ref for features with string id", () => {
      const result = attachFeatureRefs(
        {
          features: [
            { id: "commune.1", geometry: { type: "Point", coordinates: [2.35, 48.85] }, properties: { nom: "Test" } },
          ],
        },
        "ADMINEXPRESS-COG.LATEST:commune",
      );

      expect(result.features[0].feature_ref).toEqual({
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      });
    });

    it("should skip features without feature_ref (non-string id)", () => {
      const result = attachFeatureRefs(
        {
          features: [
            { id: 42, properties: { name: "no-string-id" } },
          ],
        },
        "TEST:type",
      );

      expect(result.features[0]).not.toHaveProperty("feature_ref");
    });

    it("should inject typename into feature_ref for multiple features", () => {
      const result = attachFeatureRefs(
        {
          features: [
            { id: "commune.1", geometry: null, properties: { nom: "A" } },
            { id: "commune.2", geometry: null, properties: { nom: "B" } },
            { id: 42, properties: { nom: "C" } },
          ],
        },
        "ADMINEXPRESS-COG.LATEST:commune",
      );

      expect(result.features).toHaveLength(3);
      expect(result.features[0].feature_ref).toEqual({
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      });
      expect(result.features[1].feature_ref).toEqual({
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.2",
      });
      // Non-string id: no feature_ref injected
      expect(result.features[2]).not.toHaveProperty("feature_ref");
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

