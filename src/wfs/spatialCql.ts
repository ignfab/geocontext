/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { Geometry } from "geojson";
import type { SpatialFilter } from "./schema.js";
import { geometryToEwkt } from "./geometry.js";

export const MAX_SPATIAL_FILTER_BYTES = 2 * 1024 * 1024;

const SMALL_SCALE_VERSIONS = ["2025", "2026", "LATEST"];

/** Maps `ADMINEXPRESS-COG.<version>:<layer>` to its CARTO-PE (small-scale) twin, if applicable. */
function toSmallScaleTypename(typename: string): string | undefined {
  const match = /^ADMINEXPRESS-COG\.([^:.]+):(.+)$/.exec(typename);
  if (!match || !SMALL_SCALE_VERSIONS.includes(match[1])) {
    return undefined;
  }
  return `ADMINEXPRESS-COG-CARTO-PE.${match[1]}:${match[2]}`;
}

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
 * Compiles an `intersects_feature` spatial filter from the resolved reference geometry.
 * Throw if the filter is too big
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param geometry Reference geometry.
 * @param referenceTypename Optional typename of the reference feature, used for error diagnostic.
 * @returns A CQL intersects predicate.
 * @throws When the predicate exceeds the budget.
 */
export function compileIntersectsFeatureSpatialFilter(
  geometryName: string,
  geometry: Geometry,
  referenceTypename?: string,
) {
  const exactFilter = `INTERSECTS(${geometryName},${geometryToEwkt(geometry)})`;
  const filterBytes = Buffer.byteLength(exactFilter, "utf8");
  if (filterBytes <= MAX_SPATIAL_FILTER_BYTES) {
    return exactFilter;
  }

  const recommendation = (() => {
    const peTwin = referenceTypename ? toSmallScaleTypename(referenceTypename) : undefined;
    if (peTwin) {
      return `Choisir une géométrie de référence moins détaillée (privilégier la couche '${peTwin}' au lieu de '${referenceTypename}') ou utiliser un filtre bbox.`;
    }
    if (referenceTypename?.includes("CARTO-PE")) {
      return "Choisir une géométrie de référence moins détaillée ou utiliser un filtre bbox.";
    }
    return "Choisir une géométrie de référence moins détaillée (privilégier les couches ADMINEXPRESS-COG-CARTO-PE pour les surfaces administratives) ou utiliser un filtre bbox.";
  })();

  throw new Error([
    `La géométrie de référence est trop volumineuse pour \`intersects_feature\`: ${filterBytes} octets de filtre (limite : ${MAX_SPATIAL_FILTER_BYTES}).`,
    recommendation,
  ].join("\n"));
}
