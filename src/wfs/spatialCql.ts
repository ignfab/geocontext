/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { SpatialFilter } from "./schema.js";

// --- Spatial Predicate Compilation ---

/**
 * Compiles a bbox spatial filter into a CQL predicate.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized bbox filter.
 * @returns A CQL bbox predicate.
 */
export function compileBboxSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "bbox" }>) {
  if (spatialFilter.west >= spatialFilter.east) {
    throw new Error("Le bbox est invalide : `west` doit être strictement inférieur à `east`.");
  }
  if (spatialFilter.south >= spatialFilter.north) {
    throw new Error("Le bbox est invalide : `south` doit être strictement inférieur à `north`.");
  }
  return `BBOX(${geometryName},${spatialFilter.west},${spatialFilter.south},${spatialFilter.east},${spatialFilter.north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsPointSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "intersects_point" }>) {
  return `INTERSECTS(${geometryName},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}))`;
}

/**
 * Compiles a distance-based spatial filter into a CQL predicate.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized distance filter.
 * @returns A CQL dwithin predicate.
 */
export function compileDwithinSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "dwithin_point" }>) {
  return `DWITHIN(${geometryName},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}),${spatialFilter.distance_m},meters)`;
}

/**
 * Compiles an `intersects_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param geometryEwkt Reference geometry serialized as EWKT.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsFeatureSpatialFilter(geometryName: string, geometryEwkt: string) {
  return `INTERSECTS(${geometryName},${geometryEwkt})`;
}
