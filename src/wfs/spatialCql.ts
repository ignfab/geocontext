/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { Geometry } from "geojson";
import type { SpatialFilter } from "./schema.js";
import { geometryToEwkt } from "./geometry.js";
import { wfsSchemaStore } from "./catalog.js";

/**
 * Maximum size of the URL-encoded `cql_filter=...` POST body accepted by the Géoplateforme WFS.
 * This matches Tomcat's default `maxPostSize` (a server setting that can change); beyond it,
 * the server silently ignores form parameters, so it returns the whole layer (measured on 2026-10-13).
 */
export const MAX_CQL_FILTER_BYTES = 2 * 1024 * 1024;

export class CqlFilterTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CqlFilterTooLargeError";
  }
}

/**
 * Computes the size of the POST body carrying a CQL filter, to compare with `MAX_CQL_FILTER_BYTES`.
 *
 * @param cqlFilter Compiled CQL filter.
 * @returns The size in bytes of the URL-encoded body (pure ASCII, so its length is its byte size).
 */
export function encodedCqlFilterBytes(cqlFilter: string) {
  return new URLSearchParams({ cql_filter: cqlFilter }).toString().length;
}

/** Returns the same-version CARTO-PE twin only when its derived typename exists in the catalog. */
function toSmallScaleTypename(typename: string): string | undefined {
  const match = /^ADMINEXPRESS-COG\.([^:.]+):(.+)$/.exec(typename);
  if (!match) {
    return undefined;
  }
  const candidate = `ADMINEXPRESS-COG-CARTO-PE.${match[1]}:${match[2]}`;
  return wfsSchemaStore.hasFeatureType(candidate) ? candidate : undefined;
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
 * Compiles a spatial filter from the intersection with a resolved reference geometry.
 * Used in `intersects_feature` and `travel_time` filters.
 * Throw if the filter is too big.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param geometry Reference geometry.
 * @param referenceTypename Typename of the reference feature for `intersects_feature`, nothing for `travel_time`. Used for error diagnostic.
 * @returns A CQL intersects predicate.
 * @throws When the predicate exceeds the budget.
 */
export function compileIntersectsFeatureSpatialFilter(
  geometryName: string,
  geometry: Geometry,
  referenceTypename?: string,
) {
  const exactFilter = `INTERSECTS(${geometryName},${geometryToEwkt(geometry)})`;
  const filterBytes = encodedCqlFilterBytes(exactFilter);
  if (filterBytes <= MAX_CQL_FILTER_BYTES) {
    return exactFilter;
  }

  const recommendation = (() => {
    if (!referenceTypename) {
      return "Réduire la taille de l'isochrone.";
    }
    const peTwin = toSmallScaleTypename(referenceTypename);
    if (peTwin) {
      return `Choisir une géométrie de référence moins détaillée : privilégier la couche '${peTwin}' au lieu de '${referenceTypename}'. Les feature_id diffèrent entre ces deux couches : ne pas réutiliser le même identifiant, retrouver l'objet dans '${peTwin}' par sa propriété cleabs (identique dans les deux couches).`;
    }
    if (referenceTypename.includes("CARTO-PE")) {
      return "Choisir une géométrie de référence moins détaillée.";
    }
    return "Choisir une géométrie de référence moins détaillée. Utiliser le tool gpf_search_types pour trouver une couche adaptée et disponible dans le catalogue.";
  })();

  const filterName = referenceTypename ? "La géométrie de référence" : "L'isochrone";
  throw new CqlFilterTooLargeError([
    `${filterName} est trop volumineuse pour \`${referenceTypename ? "intersects_feature" : "travel_time"}_filter\` : ${filterBytes} octets de filtre encodé (limite : ${MAX_CQL_FILTER_BYTES}).`,
    recommendation,
  ].join("\n"));
}
