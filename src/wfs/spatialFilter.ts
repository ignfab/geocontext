/**
 * Spatial input access helpers for the structured WFS query compiler.
 */

import type {
  GpfWfsGetFeaturesInput,
  SpatialFilter,
} from "./schema.js";
import { GPF_WFS_GET_FEATURES_SPATIAL_FILTER_KEYS } from "./schema.js";

/**
 * Reads the already-validated spatial filter from normalized tool input and
 * converts the selected per-operator object into the compiler's discriminated
 * representation.
 *
 * @param input Normalized tool input.
 * @returns The spatial filter, or `undefined` when no spatial filter is requested.
 */
export function getSpatialFilter(input: GpfWfsGetFeaturesInput): SpatialFilter | undefined {
  const usedSpatialFilters = GPF_WFS_GET_FEATURES_SPATIAL_FILTER_KEYS.filter((key) => input[key] !== undefined);
  if (usedSpatialFilters.length > 1) {
    throw new Error(`Un seul filtre spatial est autorisé (${usedSpatialFilters.join(", ")} fournis).`);
  }

  if (input.bbox_filter) {
    return { operator: "bbox", ...input.bbox_filter };
  }
  if (input.intersects_point_filter) {
    return { operator: "intersects_point", ...input.intersects_point_filter };
  }
  if (input.dwithin_point_filter) {
    return { operator: "dwithin_point", ...input.dwithin_point_filter };
  }
  if (input.intersects_feature_filter) {
    return { operator: "intersects_feature", ...input.intersects_feature_filter };
  }
  return undefined;
}
