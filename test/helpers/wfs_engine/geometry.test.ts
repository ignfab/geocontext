import { geometryToEwkt } from "../../../src/helpers/wfs_engine/geometry";

describe("geometryToEwkt", () => {
  // --- Point and MultiPoint (already partially covered via queryPreparation tests) ---

  it("should serialize a Point", () => {
    expect(geometryToEwkt({ type: "Point", coordinates: [2.3, 48.8] })).toEqual(
      "SRID=4326;POINT(2.3 48.8)",
    );
  });

  it("should serialize a MultiPoint", () => {
    expect(geometryToEwkt({ type: "MultiPoint", coordinates: [[2.3, 48.8], [2.4, 48.9]] })).toEqual(
      "SRID=4326;MULTIPOINT((2.3 48.8),(2.4 48.9))",
    );
  });

  it("should serialize a LineString", () => {
    expect(geometryToEwkt({ type: "LineString", coordinates: [[2.3, 48.8], [2.4, 48.9]] })).toEqual(
      "SRID=4326;LINESTRING(2.3 48.8,2.4 48.9)",
    );
  });

  // --- Previously uncovered types ---

  it("should serialize a MultiLineString", () => {
    const geometry = {
      type: "MultiLineString",
      coordinates: [
        [[2.3, 48.8], [2.4, 48.9]],
        [[3.0, 49.0], [3.1, 49.1]],
      ],
    };

    expect(geometryToEwkt(geometry)).toEqual(
      "SRID=4326;MULTILINESTRING((2.3 48.8,2.4 48.9),(3 49,3.1 49.1))",
    );
  });

  it("should serialize a Polygon with a single ring", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [[2.0, 48.0], [2.2, 48.0], [2.2, 48.2], [2.0, 48.0]],
      ],
    };

    expect(geometryToEwkt(geometry)).toEqual(
      "SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48))",
    );
  });

  it("should serialize a Polygon with multiple rings (outer + hole)", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]],
      ],
    };

    expect(geometryToEwkt(geometry)).toEqual(
      "SRID=4326;POLYGON((0 0,10 0,10 10,0 10,0 0),(2 2,8 2,8 8,2 8,2 2))",
    );
  });

  it("should serialize a MultiPolygon with a single polygon", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [[[2, 48], [2.2, 48], [2.2, 48.2], [2, 48]]],
      ],
    };

    expect(geometryToEwkt(geometry)).toEqual(
      "SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48)))",
    );
  });

  it("should serialize a MultiPolygon with multiple polygons", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]]],
      ],
    };

    expect(geometryToEwkt(geometry)).toEqual(
      "SRID=4326;MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((5 5,6 5,6 6,5 5)))",
    );
  });

  it("should throw for an unsupported geometry type", () => {
    expect(() =>
      geometryToEwkt({ type: "GeometryCollection", coordinates: [] }),
    ).toThrow("Le type de géométrie 'GeometryCollection' n'est pas supporté pour `intersects_feature`.");
  });

  it("should throw for a completely unknown type", () => {
    expect(() =>
      geometryToEwkt({ type: "CustomType", coordinates: null }),
    ).toThrow("Le type de géométrie 'CustomType' n'est pas supporté pour `intersects_feature`.");
  });
});
