import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compileBboxSpatialFilter,
  compileIntersectsPointSpatialFilter,
  compileDwithinSpatialFilter,
  compileIntersectsFeatureSpatialFilter,
  encodedCqlFilterBytes,
  MAX_CQL_FILTER_BYTES,
  CqlFilterTooLargeError,
} from "../../src/wfs/spatialCql";

import type { SpatialFilter } from "../../src/wfs/schema";
import { geometryToEwkt } from "../../src/wfs/geometry";
import { wfsSchemaStore } from "../../src/wfs/catalog";

// --- Shared fixtures ---

const geometryName = "the_geom";

// --- compileBboxSpatialFilter ---

describe("compileBboxSpatialFilter", () => {
  it("should compile a valid bbox filter to a CQL BBOX predicate", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.1, south: 48.7, east: 2.5, north: 48.9 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,2.1,48.7,2.5,48.9,'EPSG:4326')");
  });

  it("should reject west >= east", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 3.0, south: 48.0, east: 2.0, north: 49.0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `west` doit être strictement inférieur à `east`."
    );
  });

  it("should reject equal west and east", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.5, south: 48.0, east: 2.5, north: 49.0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `west` doit être strictement inférieur à `east`."
    );
  });

  it("should reject south >= north", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.0, south: 49.0, east: 3.0, north: 48.0 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `south` doit être strictement inférieur à `north`."
    );
  });

  it("should reject equal south and north", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 2.0, south: 48.5, east: 3.0, north: 48.5 });

    expect(() => compileBboxSpatialFilter(geometryName, filter)).toThrow(
      "Le bbox est invalide : `south` doit être strictement inférieur à `north`."
    );
  });

  it("should handle negative coordinates", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: -5.0, south: -10.0, east: -1.0, north: -2.0 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,-5,-10,-1,-2,'EPSG:4326')");
  });

  it("should handle coordinates crossing the equator", () => {
    const filter = extractSpatialFilter({ operator: "bbox", west: 10.0, south: -5.0, east: 20.0, north: 5.0 });

    const result = compileBboxSpatialFilter(geometryName, filter);

    expect(result).toEqual("BBOX(the_geom,10,-5,20,5,'EPSG:4326')");
  });
});

// --- compileIntersectsPointSpatialFilter ---

describe("compileIntersectsPointSpatialFilter", () => {
  it("should compile an intersects_point filter to a CQL INTERSECTS predicate", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: 2.3522, lat: 48.8566 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2.3522 48.8566))");
  });

  it("should handle negative coordinates", () => {
    const filter = extractSpatialFilter({ operator: "intersects_point", lon: -73.9857, lat: 40.7484 });

    const result = compileIntersectsPointSpatialFilter(geometryName, filter);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(-73.9857 40.7484))");
  });
});

// --- compileDwithinSpatialFilter ---

describe("compileDwithinSpatialFilter", () => {
  it("should compile a dwithin_point filter to a CQL DWITHIN predicate", () => {
    const filter = extractSpatialFilter({ operator: "dwithin_point", lon: 2.3522, lat: 48.8566, distance_m: 500 });

    const result = compileDwithinSpatialFilter(geometryName, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(2.3522 48.8566),500,meters)");
  });

  it("should handle a large distance", () => {
    const filter = extractSpatialFilter({ operator: "dwithin_point", lon: 0, lat: 0, distance_m: 50000 });

    const result = compileDwithinSpatialFilter(geometryName, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(0 0),50000,meters)");
  });

  it("should handle a small fractional distance", () => {
    const filter = extractSpatialFilter({ operator: "dwithin_point", lon: 5.0, lat: 43.0, distance_m: 0.5 });

    const result = compileDwithinSpatialFilter(geometryName, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(5 43),0.5,meters)");
  });
});

// --- compileIntersectsFeatureSpatialFilter ---

describe("compileIntersectsFeatureSpatialFilter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Fits under the limit as raw text, but not once URL-encoded (`(`, `)`, `,` take 3 bytes each).
  const oversizedGeometry = {
    type: "MultiPoint" as const,
    coordinates: Array.from({ length: 120_000 }, (_, index) => [2 + index / 100_000, 48]),
  };

  it("should compile an intersects_feature filter with EWKT geometry", () => {
    const geometry = {
      type: "MultiPolygon" as const,
      coordinates: [[[[2, 48], [2.2, 48], [2.2, 48.2], [2, 48]]]]
    };
    const result = compileIntersectsFeatureSpatialFilter(geometryName, geometry, "TYPENAME");

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48))))");
  });

  it("should compile with a POINT EWKT", () => {
    const geometry = { type: "Point" as const, coordinates: [2.3522, 48.8566] }

    const result = compileIntersectsFeatureSpatialFilter(geometryName, geometry, "TYPENAME");

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2.3522 48.8566))");
  });

  it("should preserve small filter geometries even when their vertices could be simplified", () => {
    const geometry = {
      type: "LineString" as const,
      coordinates: [[2, 48], [2.1, 48.00001], [2.2, 48]],
    };

    expect(compileIntersectsFeatureSpatialFilter(geometryName, geometry, "TYPENAME")).toEqual(
      `INTERSECTS(the_geom,${geometryToEwkt(geometry)})`,
    );
  });

  it("should reject filter geometries whose URL-encoded filter is oversized", () => {
    const filter = `INTERSECTS(the_geom,${geometryToEwkt(oversizedGeometry)})`;
    expect(Buffer.byteLength(filter)).toBeLessThan(MAX_CQL_FILTER_BYTES);
    expect(encodedCqlFilterBytes(filter)).toBeGreaterThan(MAX_CQL_FILTER_BYTES);
    expect(() => compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry, "TYPENAME")).toThrow(
      /géométrie.*trop volumineuse.*/,
    );
  });

  it("should identify an oversized isochrone and recommend choosing a smaller one", () => {
    const compile = () => compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry);

    expect(compile).toThrow(CqlFilterTooLargeError);
    expect(compile).toThrow("travel_time_filter");
    expect(compile).toThrow("Réduire la taille de l'isochrone.");
  });

  it.each(["LATEST", "2025", "2026", "2027", "FUTURE"])(
    "should suggest a catalog-confirmed same-version twin for %s",
    (version) => {
      const candidate = `ADMINEXPRESS-COG-CARTO-PE.${version}:departement`;
      const hasFeatureType = vi.spyOn(wfsSchemaStore, "hasFeatureType")
        .mockImplementation((typename) => typename === candidate);

      expect(() =>
        compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry, `ADMINEXPRESS-COG.${version}:departement`),
      ).toThrow(candidate);
      expect(hasFeatureType).toHaveBeenCalledWith(candidate);
    },
  );

  it("should suggest the corresponding -CARTO-PE layer from the embedded catalog", () => {
    expect(() =>
      compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry, "ADMINEXPRESS-COG.LATEST:departement"),
    ).toThrow(/ADMINEXPRESS-COG-CARTO-PE\.LATEST:departement/);
  });

  it.each([
    "ADMINEXPRESS-COG.1099:departement",
    "ADMINEXPRESS-COG.LATEST:missing_layer",
  ])("should not recommend an absent twin for %s", (typename) => {
    vi.spyOn(wfsSchemaStore, "hasFeatureType").mockReturnValue(false);
    const compile = () => compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry, typename);

    expect(compile).toThrow(/gpf_search_types/);
    expect(compile).not.toThrow(/ADMINEXPRESS-COG-CARTO-PE/);
  });

  it("should suggest catalog search when reference has no known naming convention", () => {
    const hasFeatureType = vi.spyOn(wfsSchemaStore, "hasFeatureType");
    const compile = () => compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry, "BDTOPO_V3:batiment");

    expect(compile).toThrow(/gpf_search_types/);
    expect(compile).not.toThrow(/ADMINEXPRESS-COG-CARTO-PE/);
    expect(hasFeatureType).not.toHaveBeenCalled();
  });

  it("should not recommend -CARTO-PE when already using a -CARTO-PE reference layer", () => {
    const compile = () => compileIntersectsFeatureSpatialFilter(geometryName, oversizedGeometry, "ADMINEXPRESS-COG-CARTO-PE.LATEST:departement");
    expect(compile).toThrow();
    expect(compile).not.toThrow(/ADMINEXPRESS-COG-CARTO-PE/);
  });

  it("should not look up a twin when the geometry fits within the limit", () => {
    const hasFeatureType = vi.spyOn(wfsSchemaStore, "hasFeatureType");
    const geometry = { type: "Point" as const, coordinates: [2, 48] };

    expect(compileIntersectsFeatureSpatialFilter(geometryName, geometry, "ADMINEXPRESS-COG.LATEST:departement"))
      .toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2 48))");
    expect(hasFeatureType).not.toHaveBeenCalled();
  });
});

// --- Helpers ---

const VALID_OPERATORS: readonly string[] = ["bbox", "intersects_point", "dwithin_point", "intersects_feature"];

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
