/**
 * Execution helpers for exact WFS feature lookup by `feature_id`.
 *
 * This module runs the structured WFS by-id flow independently from MCP tool
 * concerns such as schema exposure and response formatting.
 */

import type { Collection } from "@ignfab/gpf-schema-store";

import { getFeatureType, fetchFeatureCollection } from "./execution.js";
import { compileSelectProperty, getGeometryProperty } from "./compile.js";
import { buildGetFeatureByIdRequest } from "./request.js";
import { attachFeatureRefs } from "./response.js";

export type GetFeatureByIdExecutionInput = {
    typename: string;
    feature_id: string;
    result_type: "results" | "request";
    select?: string[];
};

type BuildPropertyNameInput = {
  result_type: "results" | "request";
  select?: string[];
};

/**
 * Builds the optional `propertyName` request parameter from `select`.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param input Normalized tool input.
 * @returns A comma-separated property list, or `undefined` when all properties should be returned.
 */
export function buildPropertyName(
    featureType: Collection,
    input: BuildPropertyNameInput,
) {
    if (!input.select || input.select.length === 0) {
        return undefined;
    }

    const geometryProperty = getGeometryProperty(featureType);
    const selectedProperties = input.select.map((propertyName) =>
        compileSelectProperty(featureType, geometryProperty, propertyName),
    );

    if (input.result_type === "request") {
        return [...selectedProperties, geometryProperty.name].join(",");
    }

    return selectedProperties.join(",");
}

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
 * @param input Normalized by-id execution input.
 * @param deps Optional injectable dependencies used for catalog lookup and WFS request execution.
 * @returns A transformed FeatureCollection containing exactly one feature.
 */
export async function executeGetFeatureById(
  input: GetFeatureByIdExecutionInput,
) {
  const featureType: Collection = await getFeatureType(input.typename);
  const propertyName = buildPropertyName(featureType, input);
  const request = buildGetFeatureByIdRequest(
    input.typename,
    input.feature_id,
    propertyName,
  );

  const featureCollection = await fetchFeatureCollection(request);

  if (!Array.isArray(featureCollection?.features)) {
    throw new Error("Le service WFS n'a pas retourné de collection d'objets exploitable.");
  }

  if (featureCollection.features.length === 0) {
    throw new Error(`Le feature '${input.feature_id}' est introuvable dans '${input.typename}'.`);
  }

  if (featureCollection.features.length > 1) {
    throw new Error(
      `Le feature '${input.feature_id}' dans '${input.typename}' devrait être unique, mais ${featureCollection.features.length} objets ont été retournés.`
    );
  }

  const [firstFeature] = featureCollection.features;

  if (firstFeature?.id !== input.feature_id) {
    throw new Error(
      `Le service WFS a retourné l'identifiant '${String(firstFeature?.id)}' au lieu de '${input.feature_id}'.`
    );
  }

  const singleFeatureCollection = {
    ...featureCollection,
    features: [firstFeature],
    totalFeatures: 1,
    numberReturned: 1,
    numberMatched: 1,
  };

  return attachFeatureRefs(singleFeatureCollection, input.typename);
}
