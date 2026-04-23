import type { Collection } from "@ignfab/gpf-schema-store";

import logger from "../../logger.js";
import {
  compileQueryParts,
  geometryToEwkt,
  getGeometryProperty,
  getSpatialFilter,
  type CompiledQuery,
  type ResolvedFeatureGeometryRef,
} from "./compile.js";
import {
  fetchFeatureCollection,
  getFeatureType,
  getMatchedFeatureCount,
} from "./execution.js";
import {
  buildMainRequest,
  buildReferenceGeometryRequest,
  type CompiledRequest,
} from "./request.js";
import { attachFeatureRefs } from "./response.js";
import type { GpfWfsGetFeaturesInput } from "./schema.js";

/**
 * Shared execution helpers for structured WFS feature search.
 *
 * This module owns the WFS-side execution flow for `gpf_wfs_get_features`:
 * request preparation, optional reference-geometry lookup, query execution,
 * hit counting, and FeatureCollection post-processing.
 */

// --- Types ---

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
  input: GpfWfsGetFeaturesInput,
) {
  if (
    input.spatial_operator === "intersects_feature" &&
    input.intersects_feature_typename !== undefined &&
    input.typename === input.intersects_feature_typename
  ) {
    throw new Error(
      "Le filtre `intersects_feature` sur le même `typename` retourne potentiellement plusieurs objets. " +
        "Utiliser `gpf_wfs_get_feature_by_id` avec `{ typename, feature_id: intersects_feature_id }` pour cibler exactement un objet.",
    );
  }
}

// --- Reference Geometry ---

/**
 * Resolves the geometry of a reference feature when `intersects_feature` is used,
 * then converts it to EWKT for CQL compilation.
 *
 * This helper currently reads the first feature returned by the reference
 * lookup. It ensures that a feature exists and exposes a usable geometry, but
 * does not enforce strict uniqueness or exact `id` matching beyond what the WFS
 * request itself guarantees.
 *
 * @param input Normalized tool input.
 * @returns The resolved reference geometry, or `undefined` when no reference feature is needed.
 */
export async function resolveIntersectsFeatureGeometry(
  input: GpfWfsGetFeaturesInput,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);
  if (!spatialFilter || spatialFilter.operator !== "intersects_feature") {
    return undefined;
  }

  const referenceFeatureType = await getFeatureType(spatialFilter.typename);
  const referenceGeometryProperty = getGeometryProperty(referenceFeatureType);
  const request = buildReferenceGeometryRequest(
    spatialFilter.typename,
    spatialFilter.feature_id,
    referenceGeometryProperty.name,
  );
  const featureCollection = await fetchFeatureCollection(request);
  const referenceFeature = Array.isArray(featureCollection?.features)
    ? featureCollection.features[0]
    : undefined;

  if (!referenceFeature) {
    throw new Error(
      `Le feature de référence '${spatialFilter.feature_id}' est introuvable dans '${spatialFilter.typename}'.`,
    );
  }
  if (!referenceFeature?.geometry) {
    throw new Error(
      `Le feature de référence '${spatialFilter.feature_id}' n'a pas de géométrie exploitable.`,
    );
  }

  return {
    typename: spatialFilter.typename,
    feature_id: spatialFilter.feature_id,
    geometry_ewkt: geometryToEwkt(referenceFeature.geometry),
  };
}

// --- Request Preparation ---

/**
 * Prepares the main WFS request for `gpf_wfs_get_features`.
 *
 * This includes upfront validation of unsupported same-typename
 * `intersects_feature` requests, feature type lookup, optional
 * reference-geometry resolution, query compilation, and request assembly.
 *
 * @param input Normalized tool input.
 * @returns The compiled query fragments and final WFS request.
 */
export async function prepareGetFeaturesRequest(
  input: GpfWfsGetFeaturesInput,
): Promise<PreparedGetFeaturesRequest> {
  ensureIntersectsFeatureTargetsOtherTypename(input);

  const featureType: Collection = await getFeatureType(input.typename);
  const resolvedGeometryRef = await resolveIntersectsFeatureGeometry(input);
  const compiled = compileQueryParts(input, featureType, resolvedGeometryRef);
  const request = buildMainRequest(input, compiled);

  return { compiled, request };
}

// --- Execution ---

/**
 * Executes the structured WFS search flow for `result_type="results"` and `hits`.
 *
 * This function prepares the request, executes it against the live WFS, then
 * either extracts a hit count or attaches `feature_ref` metadata to the result
 * FeatureCollection.
 *
 * @param input Normalized tool input.
 * @returns Either a hit-count payload or a transformed FeatureCollection.
 */
export async function executeGetFeatures(input: GpfWfsGetFeaturesInput) {
  const { compiled, request } = await prepareGetFeaturesRequest(input);

  let featureCollection: any;
  try {
    logger.info(
      `[gpf_wfs_get_features] POST ${request.url}?${new URLSearchParams(request.query).toString()}`,
    );
    featureCollection = await fetchFeatureCollection(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(`Illegal property name: ${compiled.geometryProperty.name}`)) {
      throw new Error(
        `Le champ géométrique '${compiled.geometryProperty.name}' issu du catalogue embarqué est rejeté par le WFS live pour '${input.typename}'. Le catalogue embarqué est probablement désynchronisé. Détail : ${message}`,
      );
    }
    throw error;
  }

  if (input.result_type === "hits") {
    return {
      result_type: "hits" as const,
      totalFeatures: getMatchedFeatureCount(featureCollection),
    };
  }

  return attachFeatureRefs(featureCollection, input.typename);
}
