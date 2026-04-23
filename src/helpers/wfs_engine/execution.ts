/**
 * Low-level WFS execution helpers for the structured WFS engine.
 *
 * This module centralizes:
 * - feature type lookup from the embedded catalog
 * - execution of compiled WFS requests
 * - extraction of response-level metadata such as total hit counts
 */

import type { CompiledRequest } from "./request.js";
import { wfsClient } from "../../gpf/wfs-schema-catalog.js";
import { fetchJSONPost } from "../http.js";

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
