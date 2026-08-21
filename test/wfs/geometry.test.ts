import { describe, expect, it } from "vitest";
import { geometryToEwkt } from "../../src/wfs/geometry";
import { Geometry } from "geojson";
import { isGeometryLike } from "../../src/helpers/geojson";
import { dropEmptyRings } from "../../src/wfs/spatialExtras";

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
    const geometry: Geometry = {
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
    const geometry: Geometry = {
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
    const geometry: Geometry = {
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
    const geometry: Geometry = {
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
    const geometry: Geometry = {
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
      geometryToEwkt({ type: "GeometryCollection", geometries: [] }),
    ).toThrow("Le type de géométrie 'GeometryCollection' n'est pas supporté pour `intersects_feature`.");
  });
});

describe("isGeometryLike", () => {
  it("returns true for a Point geometry", () => {
    expect(isGeometryLike({ type: "Point", coordinates: [2.35, 48.85] })).toBe(true);
  });

  it("returns true for a Polygon geometry", () => {
    expect(isGeometryLike({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isGeometryLike(null)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isGeometryLike("Point")).toBe(false);
  });

  it("returns false when type is missing", () => {
    expect(isGeometryLike({ coordinates: [0, 0] })).toBe(false);
  });

  it("returns false when coordinates is missing", () => {
    expect(isGeometryLike({ type: "Point" })).toBe(false);
  });

  it("returns false when type is not a string", () => {
    expect(isGeometryLike({ type: 42, coordinates: [] })).toBe(false);
  });
});

describe("dropEmptyRings", () => {
  // `@turf/bbox-clip` emits an empty ring for each part it clips away, producing
  // invalid GeoJSON: `{ coordinates: [] }` for a Polygon and `[[...], []]` for a
  // MultiPolygon. `area()` tolerates those rings, so only a structural
  // assertion catches them.
  const ring = [[2, 48], [2.1, 48], [2.1, 48.1], [2, 48.1], [2, 48]];

  it("should strip the empty rings a partial clip leaves behind", () => {
    const cleaned = dropEmptyRings({ type: "MultiPolygon", coordinates: [[ring], []] });

    expect(cleaned).toEqual({ type: "MultiPolygon", coordinates: [[ring]] });
  });

  it("should return null when every part was clipped away", () => {
    expect(dropEmptyRings({ type: "MultiPolygon", coordinates: [[], []] })).toBeNull();
  });

  it("should return null for a Polygon with no rings", () => {
    expect(dropEmptyRings({ type: "Polygon", coordinates: [] })).toBeNull();
  });

  it("should pass a fully-surviving Polygon through untouched", () => {
    const polygon: Geometry = { type: "Polygon", coordinates: [ring] };

    expect(dropEmptyRings(polygon)).toEqual(polygon);
  });

  it("should preserve interior rings", () => {
    const hole = [[2.02, 48.02], [2.05, 48.02], [2.05, 48.05], [2.02, 48.05], [2.02, 48.02]];
    const polygon: Geometry = { type: "Polygon", coordinates: [ring, hole] };

    expect(dropEmptyRings(polygon)).toEqual(polygon);
  });

  it("should return null for a non-areal geometry", () => {
    expect(dropEmptyRings({ type: "LineString", coordinates: [[2, 48], [2.1, 48]] })).toBeNull();
  });
});
