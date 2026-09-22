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
export function compileBboxSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "bbox", buffer: number }>) {
  if (spatialFilter.west >= spatialFilter.east) {
    throw new Error("Le bbox est invalide : `west` doit être strictement inférieur à `east`.");
  }
  if (spatialFilter.south >= spatialFilter.north) {
    throw new Error("Le bbox est invalide : `south` doit être strictement inférieur à `north`.");
  }
  if (spatialFilter.buffer == 0) {
    return `BBOX(${geometryName},${spatialFilter.west},${spatialFilter.south},${spatialFilter.east},${spatialFilter.north},'EPSG:4326')`;
  }
  // If the buffer is non-zero, shrink or expand the bbox by the appropriate distance
  const DISTANCE_TO_ANGLE = 180 / (Math.PI * 6371008.7714)
  // For the latitude, simply move the limits by the buffer within the boundaries of -90, +90.
  const north = Math.min(90, spatialFilter.north + spatialFilter.buffer * DISTANCE_TO_ANGLE);
  const south = Math.max(-90, spatialFilter.south - spatialFilter.buffer * DISTANCE_TO_ANGLE);
  // For the longitude, note that the angular difference depends on the latitude as well.
  const west = spatialFilter.west - spatialFilter.buffer / Math.cos(spatialFilter.south*Math.PI/180) * DISTANCE_TO_ANGLE;
  const east = spatialFilter.east + spatialFilter.buffer / Math.cos(spatialFilter.north*Math.PI/180) * DISTANCE_TO_ANGLE;
  if (west >= east || south >= north) {
    throw new Error("Le bbox devient vide après application du buffer.")
  }
  return `BBOX(${geometryName},${west},${south},${east},${north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsPointSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "intersects_point", buffer: number }>) {
  if (spatialFilter.buffer > 0) {
    return `DWITHIN(${geometryName},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}),${spatialFilter.buffer},meters)`;
  }
  if (spatialFilter.buffer < 0) {
    throw new Error("Le filtre `intersects_point` ne peut pas être utilisé avec un buffer négatif.")
  }
  return `INTERSECTS(${geometryName},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}))`;
}

/**
 * Compiles an `intersects_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param geometryEwkt Reference geometry serialized as EWKT.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsFeatureSpatialFilter(geometryName: string, geometryEwkt: string, buffer: number) {
  if (buffer > 0) {
    return `DWITHIN(${geometryName},${geometryEwkt},${buffer},meters)`;
  }
  if (buffer < 0) {
    // TODO: handle the buffer < 0 case using https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/buffer/BufferOp.html
    throw new Error("Negative buffers are not handled yet.")
  }
  return `INTERSECTS(${geometryName},${geometryEwkt})`;
}
