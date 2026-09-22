import { describe, expect, it } from "vitest";

import {
  compileBboxSpatialFilter,
  compileIntersectsPointSpatialFilter,
  compileIntersectsFeatureSpatialFilter,
} from "../../src/wfs/spatialCql";

import type { SpatialFilter } from "../../src/wfs/schema";

// --- Shared fixtures ---

const geometryName = "the_geom";

// --- compileBboxSpatialFilter ---

describe("compileBboxSpatialFilter", () => {
  it("should compile a valid bbox filter to a CQL BBOX predicate", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.1, south: 48.7, east: 2.5, north: 48.9, buffer: 0 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,2.1,48.7,2.5,48.9,'EPSG:4326')");
  });

  it("should reject west >= east", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 3.0, south: 48.0, east: 2.0, north: 49.0, buffer: 0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `west` doit être strictement inférieur à `east`."
    );
  });

  it("should reject equal west and east", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.5, south: 48.0, east: 2.5, north: 49.0, buffer: 0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `west` doit être strictement inférieur à `east`."
    );
  });

  it("should reject south >= north", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.0, south: 49.0, east: 3.0, north: 48.0, buffer: 0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `south` doit être strictement inférieur à `north`."
    );
  });

  it("should reject equal south and north", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.0, south: 48.5, east: 3.0, north: 48.5, buffer: 0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `south` doit être strictement inférieur à `north`."
    );
  });

  it("should handle negative coordinates", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: -5.0, south: -10.0, east: -1.0, north: -2.0, buffer: 0 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,-5,-10,-1,-2,'EPSG:4326')");
  });

  it("should handle coordinates crossing the equator", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 10.0, south: -5.0, east: 20.0, north: 5.0, buffer: 0 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,10,-5,20,5,'EPSG:4326')");
  });

  it("should handle a positive buffer", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 4.840234, south: 46.789621, east: 4.840775, north: 46.789829, buffer: 50 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,4.839577254155318,46.789171339816114,4.841431748382662,46.79027866018388,'EPSG:4326')");
  });
});

// --- compileIntersectsPointSpatialFilter ---

describe("compileIntersectsPointSpatialFilter", () => {
  it("should compile an intersects_point filter to a CQL INTERSECTS predicate", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: 2.3522, lat: 48.8566, buffer: 0 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2.3522 48.8566))");
  });

  it("should handle negative coordinates", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: -73.9857, lat: 40.7484, buffer: 0 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(-73.9857 40.7484))");
  });
  
  it("should compile an intersects_point filter with a positive buffer to a CQL DWITHIN predicate", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: 2.3522, lat: 48.8566, buffer: 500 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(2.3522 48.8566),500,meters)");
  });

  it("should handle a large distance", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: 0, lat: 0, buffer: 50000 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(0 0),50000,meters)");
  });

  it("should handle a small fractional distance", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: 5.0, lat: 43.0, buffer: 0.5 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(5 43),0.5,meters)");
  });

  it("should disallow negative buffer", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: 5.0, lat: 43.0, buffer: -10 });

    expect(() => compileIntersectsPointSpatialFilter(geometryName, filter)).toThrow(
      "Le filtre `intersects_point` ne peut pas être utilisé avec un buffer négatif."
    );
  });
});

// --- compileIntersectsFeatureSpatialFilter ---

describe("compileIntersectsFeatureSpatialFilter", () => {
  it("should compile an intersects_feature filter with EWKT geometry", () => {
    const ewkt = "SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48)))";

    const result = compileIntersectsFeatureSpatialFilter(geometryName, ewkt, 0);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48))))");
  });

  it("should compile with a POINT EWKT", () => {
    const ewkt = "SRID=4326;POINT(2.3522 48.8566)";

    const result = compileIntersectsFeatureSpatialFilter(geometryName, ewkt, 0);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2.3522 48.8566))");
  });

  it("should compile with a positive buffer", () => {
    const ewkt = "SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48)))";

    const result = compileIntersectsFeatureSpatialFilter(geometryName, ewkt, 30);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48))),30,meters)");
  });
});

// --- Helpers ---

const VALID_OPERATORS: readonly string[] = ["bbox", "intersects_point", "intersects_feature"];

/**
 * Type-safe helper to build a specific spatial filter variant with a runtime guard.
 *
 * Validates the operator at runtime so a mistyped fixture fails fast instead of
 * silently passing due to a bare cast.
 */
function extractSpatialFilter<T extends SpatialFilter["operator"]>(
  input: SpatialFilter & { operator: T },
): Extract<SpatialFilter, { operator: T }> {
  if (!VALID_OPERATORS.includes(input.operator)) {
    throw new Error(`Test fixture error: unexpected operator '${String(input.operator)}'`);
  }
  return input as Extract<SpatialFilter, { operator: T }>;
}
