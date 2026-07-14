/**
 * Proxy-side WFS execution engine.
 *
 * Unlike the LLM-facing `executeQueryFeatures` (which strips geometry to `null`
 * via `attachFeatureRefs` to save tokens), the proxy needs the OPPOSITE: a
 * FeatureCollection with FULL geometry, because MCP Carto renders it on a map.
 *
 * This module reuses the WFS query-compilation primitives (`compileQueryParts`,
 * `buildMainRequest`, reference-geometry resolution) but:
 * - forces the geometry column into the request `propertyName` itself, without
 *   touching `buildSelectList` (which stays coupled to the LLM `result_type`);
 * - returns the RAW FeatureCollection, never `attachFeatureRefs`;
 * - runs against an INJECTED WfsClient, so it is fully testable without network
 *   and lets the HTTP layer (commit 3) supply a size-bounded, rate-limited client.
 */

import type { Collection, CollectionProperty } from "@ignfab/gpf-schema-store";

import {
  buildGetFeatureByIdRequest,
  buildGetUrl,
  buildMainRequest,
  type CompiledRequest,
} from "../wfs/request.js";
import {
  compileQueryParts,
  geometryToEwkt,
  getGeometryProperty,
  getSpatialFilter,
  type ResolvedFeatureGeometryRef,
} from "../wfs/queryPreparation.js";
import { requireSingleFeatureById } from "../wfs/byId.js";
import type {
  WfsFeatureCollectionResponse,
  WfsFeatureResponse,
} from "../wfs/types.js";
import type { GpfGetFeaturesInput } from "../wfs/schema.js";

// --- Injected Dependencies ---

/**
 * Minimal WFS client surface the proxy engine depends on. The HTTP layer injects
 * a concrete client whose transport is size-bounded and rate-limited (commit 3);
 * tests inject a double.
 */
export type WfsClientLike = {
  getFeatureType(typename: string): Promise<Collection>;
  fetchFeatureCollection(request: CompiledRequest): Promise<WfsFeatureCollectionResponse>;
};

// --- Internal Helpers ---

/**
 * Appends the geometry column to a compiled `propertyName` selection so the WFS
 * returns full geometry. An empty/undefined selection means "all properties",
 * which already includes geometry, so it is left untouched.
 *
 * @param propertyName Comma-separated selection from `compileQueryParts`, if any.
 * @param geometryProperty Geometry property resolved for the feature type.
 * @returns A selection guaranteed to include the geometry column, or `undefined`.
 */
function ensureGeometrySelected(
  propertyName: string | undefined,
  geometryProperty: CollectionProperty,
): string | undefined {
  if (!propertyName) {
    return undefined;
  }
  const columns = propertyName.split(",");
  if (columns.includes(geometryProperty.name)) {
    return propertyName;
  }
  return [...columns, geometryProperty.name].join(",");
}

/**
 * Narrow guard for GeoJSON-like geometry objects returned by the WFS.
 */
function isGeometryLike(value: unknown): value is { type: string; coordinates: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    "coordinates" in value
  );
}

/**
 * Resolves the reference feature geometry for an `intersects_feature` filter,
 * using the injected client (a second upstream call). Returns `undefined` when
 * the input does not use `intersects_feature`.
 *
 * `travel_time` is intentionally NOT resolved here: it depends on the isochrone
 * service and is wired in a later commit alongside the concrete proxy client.
 *
 * DIVERGENCE FROM THE LLM PATH: the MCP flow rejects a same-typename
 * `intersects_feature` (`ensureIntersectsFeatureTargetsOtherTypename`) to steer
 * the model toward `gpf_get_feature_by_id` for a single object. That is an
 * LLM-ergonomics concern with no meaning for a map layer: displaying "feature X
 * plus its same-type neighbours" is a legitimate cartographic request, so the
 * proxy deliberately allows it and does not reuse that guard.
 *
 * @param input Normalized layer query input.
 * @param wfsClient Injected WFS client.
 * @returns The resolved reference geometry as EWKT, or `undefined`.
 */
async function resolveReferenceGeometry(
  input: GpfGetFeaturesInput,
  wfsClient: WfsClientLike,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);
  if (!spatialFilter || spatialFilter.operator !== "intersects_feature") {
    return undefined;
  }

  const referenceFeatureType = await wfsClient.getFeatureType(spatialFilter.typename);
  const referenceGeometryProperty = getGeometryProperty(referenceFeatureType);
  const request = buildGetFeatureByIdRequest(
    spatialFilter.typename,
    spatialFilter.feature_id,
    referenceGeometryProperty.name,
  );
  const featureCollection = await wfsClient.fetchFeatureCollection(request);
  const referenceFeature: WfsFeatureResponse = requireSingleFeatureById(featureCollection, {
    typename: spatialFilter.typename,
    feature_id: spatialFilter.feature_id,
  });

  if (!isGeometryLike(referenceFeature.geometry)) {
    throw new Error(
      `Le feature de référence '${spatialFilter.feature_id}' n'a pas de géométrie exploitable.`,
    );
  }

  return { geometry_ewkt: geometryToEwkt(referenceFeature.geometry) };
}

// --- Public Engine ---

/**
 * Executes a layer feature query and returns the RAW FeatureCollection with full
 * geometry (for map rendering by MCP Carto).
 *
 * Reuses the query-compilation primitives, forces the geometry column into the
 * request, requests WGS84 (`EPSG:4326`, [lon, lat]) to match the `/gpf` modules'
 * convention, and returns the untransformed WFS response — never trimmed.
 *
 * @param input Validated layer query input (same shape as `gpf_get_features`
 *   minus `result_type`/`spatial_extras`).
 * @param wfsClient Injected WFS client (catalog lookup + request execution).
 * @returns The raw WFS FeatureCollection, geometry preserved.
 */
export async function runGeometryFeatureQuery(
  input: GpfGetFeaturesInput,
  wfsClient: WfsClientLike,
): Promise<WfsFeatureCollectionResponse> {
  // `travel_time` needs the isochrone service (navigationIsochroneClient), which
  // is not injected into this engine yet. Without it, compileQueryParts would
  // throw a confusing "geometry not pre-resolved" error. Fail explicitly here
  // until the isochrone resolver is injected alongside the concrete proxy client.
  // TODO(commit 3): inject the isochrone resolver and remove this guard.
  if (getSpatialFilter(input)?.operator === "travel_time") {
    throw new Error(
      "Le filtre `travel_time_filter` n'est pas encore supporté par le proxy cartographique.",
    );
  }

  const featureType: Collection = await wfsClient.getFeatureType(input.typename);
  const geometryProperty = getGeometryProperty(featureType);

  const resolvedGeometryRef = await resolveReferenceGeometry(input, wfsClient);
  const compiled = compileQueryParts(input, featureType, resolvedGeometryRef);

  const request = buildMainRequest(input, {
    cqlFilter: compiled.cqlFilter,
    propertyName: ensureGeometrySelected(compiled.propertyName, geometryProperty),
    sortBy: compiled.sortBy,
  });

  // Request WGS84 lon/lat, matching the convention the /gpf modules already
  // consume. Add it to the query and regenerate get_url so both stay consistent.
  request.query.srsName = "EPSG:4326";
  request.get_url = buildGetUrl(request.url, request.query, compiled.cqlFilter);

  const featureCollection = await wfsClient.fetchFeatureCollection(request);

  // Validate the response shape before serving it as a map layer. The proxy fetch
  // path returns raw text with no schema check (unlike the LLM path's
  // parseJsonResponse), so a 200-with-error-body, `{}`, or any off-contract JSON
  // must be rejected here rather than handed to Carto as a valid-looking layer.
  // Mirrors the guard in wfsClient.fetchMultiTypename.
  if (
    featureCollection?.type !== "FeatureCollection" ||
    !Array.isArray(featureCollection.features)
  ) {
    throw new Error(
      "Le service WFS n'a pas retourné une FeatureCollection GeoJSON exploitable.",
    );
  }

  return featureCollection;
}
