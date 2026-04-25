/**
 * Legacy/simple WFS helper layer used by the domain-oriented `src/gpf/*` modules.
 *
 * This module is intentionally lightweight:
 * - it fetches raw WFS GeoJSON features
 * - it exposes a small GeoJSON point helper
 * - it maps WFS features to flattened result objects
 *
 * Unlike the structured WFS engine used by the MCP WFS tools, this layer does
 * not preserve full FeatureCollection semantics in its public outputs.
 */

import { fetchJSONGet } from "./http.js";
import type { JsonFetcher } from "./http.js";
import type { Geometry, Point } from "geojson";

const GPF_WFS_BASE_URL = process.env.GPF_WFS_BASE_URL || "https://data.geopf.fr/wfs";

export type WfsFeatureBase = {
  id: string;
  properties: Record<string, unknown>;
  bbox?: number[];
};

export type WfsFeatureWithGeometry = WfsFeatureBase & {
  geometry: Geometry;
};

export type WfsFeatureCollection<TFeature extends WfsFeatureBase = WfsFeatureBase> = {
  features?: TFeature[];
};

export type FeatureRef = {
  typename: string;
  feature_id: string;
};

export type FlatWfsFeature = Record<string, unknown> & {
  type: string;
  id: string;
  bbox?: number[];
  feature_ref?: FeatureRef;
};

/**
 * Fetches raw WFS features for the legacy/simple helper layer.
 *
 * This helper is used by `src/gpf/*` modules that build domain-specific
 * results on top of raw WFS feature arrays.
 *
 * @param {string[]} typeNames - fully qualified WFS type names
 * @param {string} cqlFilter - CQL_FILTER value
 * @param {string} errorLabel - service label used in the error message
 * @param {JsonFetcher<WfsFeatureCollection>} [fetcher] - optional custom fetcher function
 * @returns {Promise<TFeature[]>} raw GeoJSON features array
 */
export async function fetchWfsFeatures<TFeature extends WfsFeatureBase = WfsFeatureBase>(
  typeNames: string[],
  cqlFilter: string,
  errorLabel: string,
  fetcher: JsonFetcher<WfsFeatureCollection<TFeature>> = fetchJSONGet,
): Promise<TFeature[]> {
  const url = GPF_WFS_BASE_URL + "?" + new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    typeName: typeNames.join(","),
    outputFormat: "application/json",
    exceptions: "application/json",
    cql_filter: cqlFilter,
  }).toString();

  const featureCollection = await fetcher(url);
  if (!Array.isArray(featureCollection?.features)) {
    throw new Error(`Le service ${errorLabel} n'a pas retourné de collection d'objets exploitable`);
  }
  return featureCollection.features;
}

/**
 * Builds a GeoJSON Point from longitude and latitude.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {Point} GeoJSON Point
 */
export function toGeoJsonPoint(lon: number, lat: number): Point {
  return { type: "Point", coordinates: [lon, lat] };
}

/**
 * Maps a raw WFS feature to the flattened result shape used by legacy/simple
 * `src/gpf/*` helpers.
 *
 * The returned object:
 * - spreads `feature.properties` at the top level
 * - adds structural fields such as `type`, `id`, `bbox`
 * - optionally adds a reusable `feature_ref`
 *
 * This is intentionally different from the structured FeatureCollection-based
 * output used by the MCP WFS tools.
 *
 * @param {object}  feature        - Raw GeoJSON feature from WFS
 * @param {string[]} knownTypeNames - Fully qualified WFS type names used for feature_ref resolution
 * @returns {FlatWfsFeature} Flat result with type, id, bbox, optional feature_ref, and spread properties
 */
export function mapWfsFeature(feature: WfsFeatureBase, knownTypeNames: string[]): FlatWfsFeature {
  const featureType = feature.id.split(".")[0];
  const typename = knownTypeNames.find((candidate) => candidate.endsWith(`:${featureType}`));

  return {
    ...feature.properties,
    type: featureType,
    id: feature.id,
    bbox: feature.bbox,
    ...(typename ? { feature_ref: { typename, feature_id: feature.id } } : {}),
  };
}
