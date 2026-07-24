/**
 * Shared execution helpers for structured WFS feature search.
 *
 * This module owns the WFS-side execution flow for `gpf_get_features`:
 * request preparation, optional reference-geometry lookup, query execution,
 * hit counting, and FeatureCollection post-processing.
 */

import type { Collection } from "@ignfab/gpf-schema-store";

import { navigationIsochroneClient } from "../gpf/navigation.js";
import logger from "../logger.js";
import { resolveFeatureGeometryEwkt } from "./referenceGeometry.js";
import { rethrowIdentifiedCatalogDesyncError } from "./catalogDesync.js";
import {
  compileQueryParts,
  geometryToEwkt,
  getSpatialFilter,
  type CompiledQuery,
  type ResolvedFeatureGeometryRef,
} from "./queryPreparation.js";
import {
  wfsClient,
} from "./execution.js";
import { getMatchedFeatureCount } from "./response.js";
import type { WfsFeatureCollectionResponse } from "./types.js";
import {
  buildMainRequest,
  type CompiledRequest,
} from "./request.js";
import { postProcessFeatureCollection } from "./response.js";
import type { GpfQueryFeaturesInput } from "./schema.js";

// --- Types ---

/**
 * Prepared request context returned once the `get_features` input has been
 * validated, compiled, and assembled into a live WFS request.
 */
export type PreparedGetFeaturesRequest = {
  compiled: CompiledQuery;
  request: CompiledRequest;
};

// --- Validation ---

/**
 * Rejects `intersects_feature` requests that target the same typename.
 *
 * In that configuration the predicate may legitimately match multiple
 * features, so callers must switch to the by-id tool instead.
 *
 * @param input Normalized tool input.
 */
export function ensureIntersectsFeatureTargetsOtherTypename(
  input: GpfQueryFeaturesInput,
) {
  const spatialFilter = getSpatialFilter(input);
  if (
    spatialFilter?.operator === "intersects_feature" &&
    input.typename === spatialFilter.typename
  ) {
    throw new Error(
      "Le filtre `intersects_feature` sur le même `typename` retourne potentiellement plusieurs objets. " +
        "Utiliser `gpf_get_feature_by_id` avec `{ typename, feature_id: intersects_feature_filter.feature_id }` pour cibler exactement un objet.",
    );
  }
}

// --- Reference Geometry ---

/**
 * Resolves the geometry of a reference feature when `intersects_feature` is used,
 * then converts it to EWKT for CQL compilation.
 *
 * @param input Normalized tool input.
 * @returns The resolved reference geometry, or `undefined` when no reference feature is needed.
 */
export async function resolveIntersectsFeatureGeometry(
  input: GpfQueryFeaturesInput,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);
  if (!spatialFilter || spatialFilter.operator !== "intersects_feature") {
    return undefined;
  }

  return resolveFeatureGeometryEwkt(wfsClient, {
    typename: spatialFilter.typename,
    feature_id: spatialFilter.feature_id,
  });
}

/**
 * Resolves the travel-time isochrone geometry when `travel_time_filter` is used,
 * then converts it to EWKT for CQL compilation.
 *
 * @param input Normalized tool input.
 * @returns The resolved isochrone geometry, or `undefined` when no travel-time filter is requested.
 */
export async function resolveTravelTimeGeometry(
  input: GpfQueryFeaturesInput,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);
  if (!spatialFilter || spatialFilter.operator !== "travel_time") {
    return undefined;
  }

  const geometry = await navigationIsochroneClient.getTravelTimeGeometry({
    lon: spatialFilter.lon,
    lat: spatialFilter.lat,
    minutes: spatialFilter.minutes,
    profile: spatialFilter.profile,
  });

  return {
    geometry_ewkt: geometryToEwkt(geometry),
  };
}

/**
 * Resolves external geometries required by spatial filters before CQL compilation.
 *
 * @param input Normalized tool input.
 * @returns The resolved geometry, or `undefined` when the selected filter is already self-contained.
 */
export async function resolveSpatialFilterGeometry(
  input: GpfQueryFeaturesInput,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);

  switch (spatialFilter?.operator) {
    case "intersects_feature":
      return resolveIntersectsFeatureGeometry(input);
    case "travel_time":
      return resolveTravelTimeGeometry(input);
    default:
      return undefined;
  }
}

// --- Request Preparation ---

/**
 * Prepares the main WFS request for `gpf_get_features`.
 *
 * This includes upfront validation of unsupported same-typename
 * `intersects_feature` requests, feature type lookup, optional
 * reference-geometry resolution, query compilation, and request assembly.
 *
 * @param input Normalized tool input.
 * @returns The compiled query fragments and final WFS request.
 */
export async function prepareQueryFeaturesRequest(
  input: GpfQueryFeaturesInput
): Promise<PreparedGetFeaturesRequest> {
  // TODO: Assess if this guard does not prevent legitimate use cases.
  ensureIntersectsFeatureTargetsOtherTypename(input);
  // Get the feature type definition from the embedded catalog to access
  // property definitions and the geometry column name.
  const featureType: Collection = await wfsClient.getFeatureType(input.typename);
  // Resolve external geometries needed by the selected spatial filter.
  const resolvedGeometryRef = await resolveSpatialFilterGeometry(input);
  // Compile query fragments from the normalized input, feature type, and
  // optional resolved reference geometry.
  const compiled = compileQueryParts(input, featureType, resolvedGeometryRef);
  // Assemble the final WFS request from the compiled fragments.
  const request = buildMainRequest(input, compiled);

  return { compiled, request };
}

// --- Execution ---

/**
 * Executes the structured WFS flow for both the `gpf_get_features` results mode
 * and the `gpf_count_features` count mode.
 *
 * This function prepares the request, executes it against the live WFS, then
 * either extracts a hit count or attaches `feature_ref` metadata to the result
 * FeatureCollection.
 *
 * @param input Normalized tool input.
 * @returns Either a hit-count payload or a transformed FeatureCollection.
 */
export async function executeQueryFeatures(input: GpfQueryFeaturesInput) {
  const { compiled, request } = await prepareQueryFeaturesRequest(input);

  let featureCollection: WfsFeatureCollectionResponse;

  const isGetFeaturesQuery = "limit" in input

  try {
    logger.debug(
      `[${isGetFeaturesQuery ? "gpf_get_features" : "gpf_count_features"}] POST ${request.url}?${new URLSearchParams(request.query).toString()}`,
    );
    featureCollection = await wfsClient.fetchFeatureCollection(request);
  } catch (error: unknown) {
    // Rewrite an embedded-catalog geometry-column desync into a clear diagnostic
    // (shared with the proxy path); any other error passes through unchanged.
    rethrowIdentifiedCatalogDesyncError(error, compiled.geometryProperty.name, input.typename);
    throw error;
  }

  if (isGetFeaturesQuery) {
    return postProcessFeatureCollection(featureCollection, input);
  } else {
    return {
      numberMatched: getMatchedFeatureCount(featureCollection),
    };
  }
}
