/**
 * Spatial input accessor for the structured WFS query compiler.
 *
 * The public tool schema already validates `spatial_filter` as a strict
 * discriminated union, so the engine can consume it directly.
 */

import type {
  GpfWfsGetFeaturesInput,
  SpatialFilter,
} from "./schema.js";

/**
 * Returns the validated spatial filter object from the tool input.
 *
 * @param input Normalized tool input.
 * @returns The spatial filter, or `undefined` when no spatial filter is requested.
 */
export function getSpatialFilter(input: GpfWfsGetFeaturesInput): SpatialFilter | undefined {
  return input.spatial_filter;
}
