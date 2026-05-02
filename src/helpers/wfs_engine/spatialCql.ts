/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { CollectionProperty } from "@ignfab/gpf-schema-store";

import type { SpatialFilter } from "./schema.js";

// --- Spatial Predicate Compilation ---

/**
 * Compiles a bbox spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized bbox filter.
 * @returns A CQL bbox predicate.
 */
export function compileBboxSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { type: "bbox" }>) {
  if (spatialFilter.bbox.west >= spatialFilter.bbox.east) {
    throw new Error("Le bbox est invalide : `spatial_filter.bbox.west` doit être strictement inférieur à `spatial_filter.bbox.east`.");
  }
  if (spatialFilter.bbox.south >= spatialFilter.bbox.north) {
    throw new Error("Le bbox est invalide : `spatial_filter.bbox.south` doit être strictement inférieur à `spatial_filter.bbox.north`.");
  }
  return `BBOX(${geometryProperty.name},${spatialFilter.bbox.west},${spatialFilter.bbox.south},${spatialFilter.bbox.east},${spatialFilter.bbox.north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsPointSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { type: "intersects_point" }>) {
  return `INTERSECTS(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.point.lon} ${spatialFilter.point.lat}))`;
}

/**
 * Compiles a distance-based spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized distance filter.
 * @returns A CQL dwithin predicate.
 */
export function compileDwithinSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { type: "dwithin_point" }>) {
  return `DWITHIN(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.point.lon} ${spatialFilter.point.lat}),${spatialFilter.distance_m},meters)`;
}

/**
 * Compiles an `intersects_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param geometryEwkt Reference geometry serialized as EWKT.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsFeatureSpatialFilter(geometryProperty: CollectionProperty, geometryEwkt: string) {
  return `INTERSECTS(${geometryProperty.name},${geometryEwkt})`;
}
