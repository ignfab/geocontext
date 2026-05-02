/**
 * Shared execution helpers for structured WFS feature search.
 *
 * This module owns the WFS-side execution flow for `gpf_wfs_get_features`:
 * request preparation, optional reference-geometry lookup, query execution,
 * hit counting, and FeatureCollection post-processing.
 */

import type { Collection } from "@ignfab/gpf-schema-store";

import { ServiceResponseError } from "../http.js";
import logger from "../../logger.js";
import { fetchFeatureById, requireSingleFeatureById } from "./byId.js";
import {
  compileQueryParts,
  geometryToEwkt,
  getGeometryProperty,
  getSpatialFilter,
  type CompiledQuery,
  type ResolvedFeatureGeometryRef,
} from "./queryPreparation.js";
import {
  fetchFeatureCollection,
  getFeatureType,
  getMatchedFeatureCount,
  type WfsFeatureCollectionResponse,
} from "./execution.js";
import {
  buildMainRequest,
  type CompiledRequest,
} from "./request.js";
import { attachFeatureRefs } from "./response.js";
import type { GpfWfsGetFeaturesInput } from "./schema.js";

// --- Types ---

/**
 * Prepared request context returned once the `get_features` input has been
 * validated, compiled, and assembled into a live WFS request.
 */
export type PreparedGetFeaturesRequest = {
  compiled: CompiledQuery;
  request: CompiledRequest;
};

type GeometryLike = {
  type: string;
  coordinates: unknown;
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
  const spatialFilter = getSpatialFilter(input);

  if (
    spatialFilter?.type === "intersects_feature" &&
    input.typename === spatialFilter.feature_ref.typename
  ) {
    throw new Error(
      "Le filtre `intersects_feature` sur le même `typename` retourne potentiellement plusieurs objets. " +
        "Utiliser `gpf_wfs_get_feature_by_id` avec `{ typename, feature_id: spatial_filter.feature_ref.feature_id }` pour cibler exactement un objet.",
    );
  }
}

/**
 * Checks whether a raw value exposes the minimal geometry shape required by
 * `geometryToEwkt`.
 *
 * @param value Unknown feature geometry value.
 * @returns `true` when the value looks like a GeoJSON geometry object.
 */
function isGeometryLike(value: unknown): value is GeometryLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "coordinates" in value
  );
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
  input: GpfWfsGetFeaturesInput,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);
  if (!spatialFilter || spatialFilter.type !== "intersects_feature") {
    return undefined;
  }

  const referenceFeatureType = await getFeatureType(spatialFilter.feature_ref.typename);
  const referenceGeometryProperty = getGeometryProperty(referenceFeatureType);
  const featureCollection = await fetchFeatureById({
    typename: spatialFilter.feature_ref.typename,
    feature_id: spatialFilter.feature_ref.feature_id,
    propertyName: referenceGeometryProperty.name,
  });
  const referenceFeature = requireSingleFeatureById(featureCollection, {
    typename: spatialFilter.feature_ref.typename,
    feature_id: spatialFilter.feature_ref.feature_id,
  });

  if (!isGeometryLike(referenceFeature?.geometry)) {
    throw new Error(
      `Le feature de référence '${spatialFilter.feature_ref.feature_id}' n'a pas de géométrie exploitable.`,
    );
  }

  return {
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
  // TODO: Assess if this guard does not prevent legitimate use cases.
  ensureIntersectsFeatureTargetsOtherTypename(input);
  // Get the feature type definition from the embedded catalog to access
  // property definitions and the geometry column name.
  const featureType: Collection = await getFeatureType(input.typename);
  // Resolve the reference geometry for `intersects_feature`, when needed by
  // the selected spatial filter.
  const resolvedGeometryRef = await resolveIntersectsFeatureGeometry(input);
  // Compile query fragments from the normalized input, feature type, and
  // optional resolved reference geometry.
  const compiled = compileQueryParts(input, featureType, resolvedGeometryRef);
  // Assemble the final WFS request from the compiled fragments.
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

  let featureCollection: WfsFeatureCollectionResponse;

  try {
    logger.info(
      `[gpf_wfs_get_features] POST ${request.url}?${new URLSearchParams(request.query).toString()}`,
    );
    featureCollection = await fetchFeatureCollection(request);
  } catch (error: unknown) {
    if (
      error instanceof ServiceResponseError &&
      error.serviceCode === "InvalidParameterValue" &&
      error.serviceDetail === `Illegal property name: ${compiled.geometryProperty.name}`
    ) {
      throw new Error(
        `Le champ géométrique '${compiled.geometryProperty.name}' issu du catalogue embarqué est rejeté par le WFS live pour '${input.typename}'. Le catalogue embarqué est probablement désynchronisé. Détail : ${error.message}`,
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
