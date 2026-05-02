import {
  compileBboxSpatialFilter,
  compileIntersectsPointSpatialFilter,
  compileDwithinSpatialFilter,
  compileIntersectsFeatureSpatialFilter,
} from "../../../src/helpers/wfs_engine/spatialCql";

import type { CollectionProperty } from "@ignfab/gpf-schema-store";
import type { SpatialFilter } from "../../../src/helpers/wfs_engine/schema";

// --- Shared fixtures ---

const geometryProperty: CollectionProperty = {
  name: "the_geom",
  type: "multipolygon",
  defaultCrs: "EPSG:4326",
};

// --- compileBboxSpatialFilter ---

describe("compileBboxSpatialFilter", () => {
  it("should compile a valid bbox filter to a CQL BBOX predicate", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: 2.1, south: 48.7, east: 2.5, north: 48.9 },
    });

    const result = compileBboxSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("BBOX(the_geom,2.1,48.7,2.5,48.9,'EPSG:4326')");
  });

  it("should reject west >= east", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: 3.0, south: 48.0, east: 2.0, north: 49.0 },
    });

    expect(() => compileBboxSpatialFilter(geometryProperty, filter)).toThrow(
      "Le bbox est invalide : `spatial_filter.bbox.west` doit être strictement inférieur à `spatial_filter.bbox.east`."
    );
  });

  it("should reject equal west and east", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: 2.5, south: 48.0, east: 2.5, north: 49.0 },
    });

    expect(() => compileBboxSpatialFilter(geometryProperty, filter)).toThrow(
      "Le bbox est invalide : `spatial_filter.bbox.west` doit être strictement inférieur à `spatial_filter.bbox.east`."
    );
  });

  it("should reject south >= north", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: 2.0, south: 49.0, east: 3.0, north: 48.0 },
    });

    expect(() => compileBboxSpatialFilter(geometryProperty, filter)).toThrow(
      "Le bbox est invalide : `spatial_filter.bbox.south` doit être strictement inférieur à `spatial_filter.bbox.north`."
    );
  });

  it("should reject equal south and north", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: 2.0, south: 48.5, east: 3.0, north: 48.5 },
    });

    expect(() => compileBboxSpatialFilter(geometryProperty, filter)).toThrow(
      "Le bbox est invalide : `spatial_filter.bbox.south` doit être strictement inférieur à `spatial_filter.bbox.north`."
    );
  });

  it("should handle negative coordinates", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: -5.0, south: -10.0, east: -1.0, north: -2.0 },
    });

    const result = compileBboxSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("BBOX(the_geom,-5,-10,-1,-2,'EPSG:4326')");
  });

  it("should handle coordinates crossing the equator", () => {
    const filter = extractSpatialFilter({
      type: "bbox",
      bbox: { west: 10.0, south: -5.0, east: 20.0, north: 5.0 },
    });

    const result = compileBboxSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("BBOX(the_geom,10,-5,20,5,'EPSG:4326')");
  });
});

// --- compileIntersectsPointSpatialFilter ---

describe("compileIntersectsPointSpatialFilter", () => {
  it("should compile an intersects_point filter to a CQL INTERSECTS predicate", () => {
    const filter = extractSpatialFilter({
      type: "intersects_point",
      point: { lon: 2.3522, lat: 48.8566 },
    });

    const result = compileIntersectsPointSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2.3522 48.8566))");
  });

  it("should handle negative coordinates", () => {
    const filter = extractSpatialFilter({
      type: "intersects_point",
      point: { lon: -73.9857, lat: 40.7484 },
    });

    const result = compileIntersectsPointSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(-73.9857 40.7484))");
  });
});

// --- compileDwithinSpatialFilter ---

describe("compileDwithinSpatialFilter", () => {
  it("should compile a dwithin_point filter to a CQL DWITHIN predicate", () => {
    const filter = extractSpatialFilter({
      type: "dwithin_point",
      point: { lon: 2.3522, lat: 48.8566 },
      distance_m: 500,
    });

    const result = compileDwithinSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(2.3522 48.8566),500,meters)");
  });

  it("should handle a large distance", () => {
    const filter = extractSpatialFilter({
      type: "dwithin_point",
      point: { lon: 0, lat: 0 },
      distance_m: 50000,
    });

    const result = compileDwithinSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(0 0),50000,meters)");
  });

  it("should handle a small fractional distance", () => {
    const filter = extractSpatialFilter({
      type: "dwithin_point",
      point: { lon: 5.0, lat: 43.0 },
      distance_m: 0.5,
    });

    const result = compileDwithinSpatialFilter(geometryProperty, filter);

    expect(result).toEqual("DWITHIN(the_geom,SRID=4326;POINT(5 43),0.5,meters)");
  });
});

// --- compileIntersectsFeatureSpatialFilter ---

describe("compileIntersectsFeatureSpatialFilter", () => {
  it("should compile an intersects_feature filter with EWKT geometry", () => {
    const ewkt = "SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48)))";

    const result = compileIntersectsFeatureSpatialFilter(geometryProperty, ewkt);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48))))");
  });

  it("should compile with a POINT EWKT", () => {
    const ewkt = "SRID=4326;POINT(2.3522 48.8566)";

    const result = compileIntersectsFeatureSpatialFilter(geometryProperty, ewkt);

    expect(result).toEqual("INTERSECTS(the_geom,SRID=4326;POINT(2.3522 48.8566))");
  });
});

// --- Helpers ---

const VALID_TYPES: readonly string[] = ["bbox", "intersects_point", "dwithin_point", "intersects_feature"];

function extractSpatialFilter<T extends SpatialFilter["type"]>(
  input: SpatialFilter & { type: T },
): Extract<SpatialFilter, { type: T }> {
  if (!VALID_TYPES.includes(input.type)) {
    throw new Error(`Test fixture error: unexpected type '${String(input.type)}'`);
  }
  return input as Extract<SpatialFilter, { type: T }>;
}
