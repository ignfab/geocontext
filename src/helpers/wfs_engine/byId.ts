/**
 * Execution helpers for exact WFS feature lookup by `feature_id`.
 *
 * This module runs the structured WFS by-id flow independently from MCP tool
 * concerns such as schema exposure and response formatting.
 */

import type { Collection } from "@ignfab/gpf-schema-store";

import {
  getFeatureType,
  fetchFeatureCollection,
  type WfsFeatureCollectionResponse,
  type WfsFeatureResponse,
} from "./execution.js";
import { validateSelectProperty, getGeometryProperty } from "./queryPreparation.js";
import { buildGetFeatureByIdRequest } from "./request.js";
import { attachFeatureRefs } from "./response.js";

// --- Input Types ---

/**
 * Normalized execution input for the strict by-id `results` flow.
 */
export type GetFeatureByIdExecutionInput = {
  typename: string;
  feature_id: string;
  select?: string[];
};

// --- Internal Types ---

type PropertySelectionInput = {
  includeGeometry?: boolean;
  select?: string[];
};

type FetchFeatureByIdInput = {
  typename: string;
  feature_id: string;
  propertyName?: string;
};

// --- Property Selection ---

/**
 * Builds the optional `propertyName` request parameter from `select`.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param input Property selection options derived from the caller's output mode.
 * @returns A comma-separated property list, or `undefined` when all properties should be returned.
 */
export function buildPropertyName(
  featureType: Collection,
  input: PropertySelectionInput,
) {
  if (!input.select || input.select.length === 0) {
    return undefined;
  }

  const geometryProperty = getGeometryProperty(featureType);
  const selectedProperties = input.select.map((propertyName) =>
    validateSelectProperty(featureType, geometryProperty, propertyName),
  );

  if (input.includeGeometry) {
    return [...selectedProperties, geometryProperty.name].join(",");
  }

  return selectedProperties.join(",");
}

// --- Live Lookup ---

/**
 * Executes the live WFS lookup targeting a single `featureID`.
 *
 * @param input Target layer, expected feature id, and optional property selection.
 * @returns The raw FeatureCollection returned by the WFS service.
 */
export async function fetchFeatureById(
  input: FetchFeatureByIdInput,
): Promise<WfsFeatureCollectionResponse> {
  const request = buildGetFeatureByIdRequest(
    input.typename,
    input.feature_id,
    input.propertyName,
  );

  return fetchFeatureCollection(request);
}

// --- Cardinality Enforcement ---

/**
 * Enforces the strict by-id contract on a raw WFS FeatureCollection.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS service.
 * @param input Expected target layer and feature id.
 * @returns The single matching feature.
 */
export function requireSingleFeatureById(
  featureCollection: WfsFeatureCollectionResponse,
  input: Pick<GetFeatureByIdExecutionInput, "typename" | "feature_id">,
): WfsFeatureResponse {
  if (!Array.isArray(featureCollection.features)) {
    throw new Error("Le service WFS n'a pas retourné de collection d'objets exploitable.");
  }

  if (featureCollection.features.length === 0) {
    throw new Error(`Le feature '${input.feature_id}' est introuvable dans '${input.typename}'.`);
  }

  if (featureCollection.features.length > 1) {
    throw new Error(
      `Le feature '${input.feature_id}' dans '${input.typename}' devrait être unique, mais ${featureCollection.features.length} objets ont été retournés.`,
    );
  }

  const [firstFeature] = featureCollection.features;

  if (firstFeature?.id !== input.feature_id) {
    throw new Error(
      `Le service WFS a retourné l'identifiant '${String(firstFeature?.id)}' au lieu de '${input.feature_id}'.`,
    );
  }

  return firstFeature;
}

// --- Results Execution ---

/**
 * Executes the structured WFS by-id flow for `result_type="results"`.
 *
 * This function:
 * - loads the feature type from the embedded catalog
 * - builds the optional `propertyName` selection
 * - executes the WFS request for the requested `feature_id`
 * - enforces strict cardinality on the returned FeatureCollection
 * - attaches reusable `feature_ref` metadata to the final response
 *
 * Tool-specific concerns such as MCP schema exposure and request-preview
 * formatting remain outside this helper.
 *
 * This helper is intentionally scoped to the `results` path only. MCP-specific
 * request preview assembly remains in the tool layer.
 *
 * @param input Normalized by-id execution input for the `results` flow.
 * @returns A transformed FeatureCollection containing exactly one feature.
 */
export async function executeGetFeatureById(
  input: GetFeatureByIdExecutionInput,
) {
  const featureType: Collection = await getFeatureType(input.typename);
  const propertyName = buildPropertyName(featureType, {
    includeGeometry: false,
    select: input.select,
  });
  const featureCollection = await fetchFeatureById({
    typename: input.typename,
    feature_id: input.feature_id,
    propertyName,
  });
  const firstFeature = requireSingleFeatureById(featureCollection, input);

  const singleFeatureCollection = {
    ...featureCollection,
    features: [firstFeature],
    totalFeatures: 1,
    numberReturned: 1,
    numberMatched: 1,
  };

  return attachFeatureRefs(singleFeatureCollection, input.typename);
}
