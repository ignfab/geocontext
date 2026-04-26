import {
  mapToFlatItems,
  mapToFlatItemsWithGeometry,
} from "../../../src/helpers/wfs_engine/response";

describe("wfs_engine/response", () => {
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

