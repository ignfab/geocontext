/**
 * Execution helpers for exact WFS feature lookup by `feature_id`.
 *
 * This module runs the structured WFS by-id flow independently from MCP tool
 * concerns such as schema exposure and response formatting.
 */

import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";

import {
  wfsClient,
} from "./execution.js";
import type {
  WfsFeatureCollectionResponse,
  WfsFeatureResponse,
} from "./types.js";
import { validateSelectProperty, getGeometryName } from "./queryPreparation.js";
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
  spatial_extras?: string[];
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
  featureType: OgcCollectionSchema,
  input: PropertySelectionInput,
) {
  // `includeGeometry` is also an invariant check: even without `select`, a
  // cartographic/derived-geometry caller must fail against a geometry-less type
  // before issuing a WFS request.
  const geometryName = input.includeGeometry
    ? getGeometryName(featureType)
    : undefined;

  if (!input.select || input.select.length === 0) {
    return undefined;
  }

  const selectedProperties = input.select.map((propertyName) =>
    validateSelectProperty(featureType, propertyName),
  );

  if (geometryName) {
    return [...selectedProperties, geometryName].join(",");
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

  return wfsClient.fetchFeatureCollection(request);
}

// --- Cardinality Errors ---

/**
 * Raised when a by-id lookup matches ZERO features: the requested `feature_id`
 * does not exist in the target type. This is a client-caused not-found condition
 * (HTTP 404 on the proxy), distinct from an upstream anomaly.
 */
export class FeatureNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureNotFoundError";
  }
}

/**
 * Raised when a by-id lookup breaks the strict single-feature contract for a
 * reason attributable to the UPSTREAM service, not the client: more than one
 * feature returned for a unique `featureID`, an id that differs from the one
 * requested, or a collection body that is not a usable features array. Mapped to
 * HTTP 502 on the proxy (the client request was valid).
 */
export class FeatureCardinalityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureCardinalityError";
  }
}

// --- Cardinality Enforcement ---

/**
 * Enforces the strict by-id contract on a raw WFS FeatureCollection.
 *
 * Throws {@link FeatureNotFoundError} when the feature is absent (client-caused,
 * → 404) and {@link FeatureCardinalityError} for upstream contract violations
 * (duplicate, id mismatch, unusable body → 502).
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
    throw new FeatureCardinalityError("Le service WFS n'a pas retourné de collection d'objets exploitable.");
  }

  if (featureCollection.features.length === 0) {
    throw new FeatureNotFoundError(`Le feature '${input.feature_id}' est introuvable dans '${input.typename}'.`);
  }

  if (featureCollection.features.length > 1) {
    throw new FeatureCardinalityError(
      `Le feature '${input.feature_id}' dans '${input.typename}' devrait être unique, mais ${featureCollection.features.length} objets ont été retournés.`,
    );
  }

  const [firstFeature] = featureCollection.features;

  if (firstFeature?.id !== input.feature_id) {
    throw new FeatureCardinalityError(
      `Le service WFS a retourné l'identifiant '${String(firstFeature?.id)}' au lieu de '${input.feature_id}'.`,
    );
  }

  return firstFeature;
}

// --- Results Execution ---

/**
 * Executes the structured WFS by-id flow.
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
  const featureType: OgcCollectionSchema = await wfsClient.getFeatureType(input.typename);
  const propertyName = buildPropertyName(featureType, {
    includeGeometry: (input.spatial_extras ?? []).length > 0,
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

  return attachFeatureRefs(singleFeatureCollection, input.typename, input.spatial_extras);
}
