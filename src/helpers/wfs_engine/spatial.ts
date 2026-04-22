/**
 * Spatial input normalization helpers for the structured WFS query compiler.
 *
 * This module turns raw tool input parameters into normalized spatial filter
 * objects that can then be compiled into CQL fragments.
 */

import type {
  GpfWfsGetFeaturesInput,
  SpatialFilter,
} from "./schema.js";

const BBOX_PARAM_NAMES = ["bbox_west", "bbox_south", "bbox_east", "bbox_north"] as const;
const INTERSECTS_POINT_PARAM_NAMES = ["intersects_lon", "intersects_lat"] as const;
const DWITHIN_PARAM_NAMES = ["dwithin_lon", "dwithin_lat", "dwithin_distance_m"] as const;
const INTERSECTS_FEATURE_PARAM_NAMES = ["intersects_feature_typename", "intersects_feature_id"] as const;

/**
 * Checks whether any property in a named group is defined on the raw input object.
 *
 * @param input Normalized tool input.
 * @param keys Input keys to inspect.
 * @returns `true` when at least one key from the group is present.
 */
function hasAny(input: GpfWfsGetFeaturesInput, keys: readonly string[]) {
  return keys.some((name) => input[name as keyof GpfWfsGetFeaturesInput] !== undefined);
}

/**
 * Normalizes the raw spatial input into a discriminated spatial filter object.
 *
 * @param input Normalized tool input.
 * @returns A normalized spatial filter, or `undefined` when no spatial filter is requested.
 */
export function getSpatialFilter(input: GpfWfsGetFeaturesInput): SpatialFilter | undefined {
  const hasBboxParams = hasAny(input, BBOX_PARAM_NAMES);
  const hasIntersectsPointParams = hasAny(input, INTERSECTS_POINT_PARAM_NAMES);
  const hasDwithinParams = hasAny(input, DWITHIN_PARAM_NAMES);
  const hasIntersectsFeatureParams = hasAny(input, INTERSECTS_FEATURE_PARAM_NAMES);

  switch (input.spatial_operator) {
    case undefined:
      if (hasBboxParams || hasIntersectsPointParams || hasDwithinParams || hasIntersectsFeatureParams) {
        throw new Error("Les paramètres spatiaux exigent `spatial_operator`.");
      }
      return undefined;
    case "bbox":
      if (hasIntersectsPointParams || hasDwithinParams || hasIntersectsFeatureParams) {
        throw new Error("Le filtre spatial `bbox` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (input.bbox_west === undefined || input.bbox_south === undefined || input.bbox_east === undefined || input.bbox_north === undefined) {
        throw new Error("Le filtre spatial `bbox` exige `bbox_west`, `bbox_south`, `bbox_east` et `bbox_north`.");
      }
      return { operator: "bbox", west: input.bbox_west, south: input.bbox_south, east: input.bbox_east, north: input.bbox_north };
    case "intersects_point":
      if (hasBboxParams || hasDwithinParams || hasIntersectsFeatureParams) {
        throw new Error("Le filtre spatial `intersects_point` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (input.intersects_lon === undefined || input.intersects_lat === undefined) {
        throw new Error("Le filtre spatial `intersects_point` exige `intersects_lon` et `intersects_lat`.");
      }
      return { operator: "intersects_point", lon: input.intersects_lon, lat: input.intersects_lat };
    case "dwithin_point":
      if (hasBboxParams || hasIntersectsPointParams || hasIntersectsFeatureParams) {
        throw new Error("Le filtre spatial `dwithin_point` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (input.dwithin_lon === undefined || input.dwithin_lat === undefined || input.dwithin_distance_m === undefined) {
        throw new Error("Le filtre spatial `dwithin_point` exige `dwithin_lon`, `dwithin_lat` et `dwithin_distance_m`.");
      }
      return { operator: "dwithin_point", lon: input.dwithin_lon, lat: input.dwithin_lat, distance_m: input.dwithin_distance_m };
    case "intersects_feature":
      if (hasBboxParams || hasIntersectsPointParams || hasDwithinParams) {
        throw new Error("Le filtre spatial `intersects_feature` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (!input.intersects_feature_typename || !input.intersects_feature_id) {
        throw new Error("Le filtre spatial `intersects_feature` exige `intersects_feature_typename` et `intersects_feature_id`.");
      }
      return { operator: "intersects_feature", typename: input.intersects_feature_typename, feature_id: input.intersects_feature_id };
  }
}
