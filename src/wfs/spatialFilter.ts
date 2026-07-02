/**
 * Spatial input access helpers for the structured WFS query compiler.
 */

import type {
  GpfGetOrCountFeaturesInput,
  SpatialFilter,
} from "./schema.js";
import { GPF_GET_FEATURES_SPATIAL_FILTER_KEYS } from "./schema.js";

const FILTER_KEY_TO_OPERATOR = {
  bbox_filter: "bbox",
  intersects_point_filter: "intersects_point",
  dwithin_point_filter: "dwithin_point",
  intersects_feature_filter: "intersects_feature",
  adjacent_feature_filter: "adjacent_feature",
  travel_time_filter: "travel_time",
} as const satisfies Record<(typeof GPF_GET_FEATURES_SPATIAL_FILTER_KEYS)[number], string>;

/**
 * Reads the already-validated spatial filter from normalized tool input and
 * converts the selected per-operator object into the compiler's discriminated
 * representation.
 *
 * The mutual exclusivity of spatial filters is enforced upstream by the Zod
 * schema's `superRefine`; this function assumes a single filter at most.
 *
 * @param input Normalized tool input.
 * @returns The spatial filter, or `undefined` when no spatial filter is requested.
 */
export function getSpatialFilter(input: GpfGetOrCountFeaturesInput): SpatialFilter | undefined {
  for (const key of GPF_GET_FEATURES_SPATIAL_FILTER_KEYS) {
    const value = input[key];
    if (value) {
      return { operator: FILTER_KEY_TO_OPERATOR[key], ...value } as SpatialFilter;
    }
  }
  return undefined;
}
