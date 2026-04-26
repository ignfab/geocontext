/**
 * Low-level WFS execution helpers for the structured WFS engine.
 *
 * This module centralizes:
 * - feature type lookup from the embedded catalog
 * - execution of compiled WFS requests
 * - extraction of response-level metadata such as total hit counts
 */

import type { CompiledRequest } from "./request.js";
import { buildMultiTypenameRequest } from "./request.js";
import { wfsClient } from "../../gpf/wfs-schema-catalog.js";
import { fetchJSONGet, fetchJSONPost } from "../http.js";

// --- Response Types ---

export type WfsFeatureResponse = {
  type?: "Feature";
  id?: string;
  geometry?: unknown;
  geometry_name?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WfsFeatureCollectionResponse = Record<string, unknown> & {
  features?: WfsFeatureResponse[];
  totalFeatures?: number;
  numberMatched?: number | "unknown";
  numberReturned?: number;
};

// --- Catalog Lookup ---

/**
 * Loads a WFS feature type description from the embedded catalog.
 *
 * @param typename Exact WFS typename to load from the embedded schema store.
 * @returns The matching feature type description.
 */
export async function getFeatureType(typename: string) {
  return wfsClient.getFeatureType(typename);
}

// --- Request Execution ---

/**
 * Executes a compiled WFS request as POST and returns the JSON FeatureCollection.
 *
 * @param request Compiled request split into query-string parameters and POST body.
 * @returns The parsed JSON response returned by the WFS endpoint.
 */
export async function fetchFeatureCollection(request: CompiledRequest): Promise<WfsFeatureCollectionResponse> {
  const url = `${request.url}?${new URLSearchParams(request.query).toString()}`;
  return fetchJSONPost(url, request.body, {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  }) as Promise<WfsFeatureCollectionResponse>;
}

// --- Response Metadata ---

/**
 * Extracts a result count from a WFS response, preferring `numberMatched`.
 * Explicitly rejects responses that do not provide a usable total.
 *
 * @param featureCollection Parsed WFS response object.
 * @returns The total number of matching features.
 */
export function getMatchedFeatureCount(featureCollection: WfsFeatureCollectionResponse) {
  if (typeof featureCollection.numberMatched === "number") {
    return featureCollection.numberMatched;
  }
  if (featureCollection.numberMatched === "unknown") {
    throw new Error("Le service WFS a renvoyé un comptage indéterminé (numberMatched=\"unknown\").");
  }
  if (typeof featureCollection.totalFeatures === "number") {
    return featureCollection.totalFeatures;
  }
  throw new Error("Le service WFS n'a pas retourné de comptage exploitable");
}

// --- Multi-typename Execution ---

/**
 * Input parameters for multi-typename WFS execution.
 */
export type MultiTypenameExecutionInput = {
  /** Fully qualified WFS type names to query. */
  typenames: string[];
  /** Pre-compiled CQL filter string, when the request needs one. */
  cqlFilter?: string;
  /** Service label used in error messages. */
  errorLabel: string;
};

/**
 * Executes a WFS GetFeature request targeting multiple typenames.
 *
 * Uses GET instead of POST because the GPF GeoServer rejects CQL filters
 * with geometry column references when multiple typenames are queried via POST
 * ("Extracted invalid join sub-filter ... it users more than one feature type").
 *
 * This helper is used by domain-oriented modules (`src/gpf/*`) that
 * query several WFS layers at once with a pre-compiled CQL filter.
 *
 * @param input Multi-typename execution parameters.
 * @returns The parsed JSON FeatureCollection returned by the WFS endpoint.
 */
export async function fetchWfsMultiTypename(
  input: MultiTypenameExecutionInput,
): Promise<WfsFeatureCollectionResponse> {
  const request = buildMultiTypenameRequest({
    typenames: input.typenames,
    cqlFilter: input.cqlFilter,
  });

  const params = new URLSearchParams(request.query);
  if (request.body) {
    const bodyParams = new URLSearchParams(request.body);
    for (const [key, value] of bodyParams.entries()) {
      params.set(key, value);
    }
  }

  const url = `${request.url}?${params.toString()}`;
  const featureCollection = await fetchJSONGet(url) as WfsFeatureCollectionResponse;

  if (!Array.isArray(featureCollection?.features)) {
    throw new Error(
      `Le service ${input.errorLabel} n'a pas retourné de collection d'objets exploitable`,
    );
  }

  return featureCollection;
}
