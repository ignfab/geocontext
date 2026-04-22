/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { CollectionProperty } from "@ignfab/gpf-schema-store";

import type { SpatialFilter } from "./schema.js";

/**
 * Compiles a bbox spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized bbox filter.
 * @returns A CQL bbox predicate.
 */
export function compileBboxSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "bbox" }>) {
  if (spatialFilter.west >= spatialFilter.east) {
    throw new Error("Le bbox est invalide : `bbox_west` doit être strictement inférieur à `bbox_east`.");
  }
  if (spatialFilter.south >= spatialFilter.north) {
    throw new Error("Le bbox est invalide : `bbox_south` doit être strictement inférieur à `bbox_north`.");
  }
  return `BBOX(${geometryProperty.name},${spatialFilter.west},${spatialFilter.south},${spatialFilter.east},${spatialFilter.north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsPointSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "intersects_point" }>) {
  return `INTERSECTS(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}))`;
}

/**
 * Compiles a distance-based spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized distance filter.
 * @returns A CQL dwithin predicate.
 */
export function compileDwithinSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "dwithin_point" }>) {
  return `DWITHIN(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}),${spatialFilter.distance_m},meters)`;
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
