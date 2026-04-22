import type { CompiledRequest } from "./request.js";
import { wfsClient } from "../../gpf/wfs-schema-catalog.js";
import { fetchJSONPost } from "../../helpers/http.js";

/**
 * Shared WFS execution helpers for the structured WFS engine.
 *
 * This module centralizes catalog lookup, compiled request execution, and a few
 * low-level response helpers reused by MCP WFS tools.
 */

/**
 * Loads a WFS feature type description from the embedded catalog.
 *
 * @param typename Exact WFS typename to load from the embedded schema store.
 * @returns The matching feature type description.
 */
export async function getFeatureType(typename: string) {
    return wfsClient.getFeatureType(typename);
}

/**
 * Executes a compiled WFS request as POST and returns the JSON FeatureCollection.
 *
 * @param request Compiled request split into query-string parameters and POST body.
 * @returns The parsed JSON response returned by the WFS endpoint.
 */
export async function fetchFeatureCollection(request: CompiledRequest) {
    const url = `${request.url}?${new URLSearchParams(request.query).toString()}`;
    return fetchJSONPost(url, request.body, {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    });
}

/**
 * Extracts a result count from a WFS response, preferring `numberMatched`.
 * Explicitly rejects responses that do not provide a usable total.
 *
 * @param featureCollection Parsed WFS response object.
 * @returns The total number of matching features.
 */
export function getMatchedFeatureCount(featureCollection: Record<string, unknown>) {
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