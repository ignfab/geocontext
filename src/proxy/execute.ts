/**
 * Proxy-side WFS execution engine.
 *
 * `runGeometryFeatureQuery` (entry point) compiles and runs the layer query;
 * `resolveReferenceGeometry` (internal helper) resolves the reference geometry
 * for `intersects_feature` / `travel_time` filters.
 *
 * Unlike the LLM-facing `executeQueryFeatures` (which strips geometry to `null`
 * via `attachFeatureRefs` to save tokens), the proxy needs the OPPOSITE: a
 * FeatureCollection with FULL geometry, because MCP Carto renders it on a map.
 *
 * This module reuses the WFS query-compilation primitives (`compileQueryParts`,
 * `buildMainRequest`, reference-geometry resolution) but:
 * - forces the geometry column into the request `propertyName` itself, without
 *   touching `buildSelectList` (which stays coupled to the LLM `select`/`spatial_extras` knobs);
 * - returns the RAW FeatureCollection, never `attachFeatureRefs`;
 * - runs against an INJECTED WfsClient, so it is fully testable without network
 *   and lets the HTTP layer supply a size-bounded, rate-limited client.
 */

import type { Collection, CollectionProperty } from "@ignfab/gpf-schema-store";

import {
  buildGetFeatureByIdRequest,
  buildMainRequest,
  type CompiledRequest,
} from "../wfs/request.js";
import {
  compileQueryParts,
  getGeometryProperty,
  getSpatialFilter,
  type ResolvedFeatureGeometryRef,
} from "../wfs/queryPreparation.js";
import { buildPropertyName, requireSingleFeatureById } from "../wfs/byId.js";
import { resolveFeatureGeometryEwkt } from "../wfs/referenceGeometry.js";
import { rewriteIllegalGeometryColumnError } from "../wfs/catalogDesync.js";
import { ServiceResponseError, extractJsonServiceError } from "../helpers/http.js";
import type { WfsFeatureCollectionResponse } from "../wfs/types.js";
import type { GpfGetFeaturesInput, GpfGetFeatureByIdLayerInput } from "../wfs/schema.js";

// --- Injected Dependencies ---

/**
 * Minimal WFS client surface the proxy engine depends on. The HTTP layer injects
 * a concrete client whose transport is size-bounded and rate-limited;
 * tests inject a double.
 */
export type WfsClientLike = {
  getFeatureType(typename: string): Promise<Collection>;
  fetchFeatureCollection(request: CompiledRequest): Promise<WfsFeatureCollectionResponse>;
};

/**
 * Resolves the isochrone geometry for a `travel_time` filter (EWKT). Injected by
 * the HTTP layer (backed by the navigation/isochrone service). Required, because
 * `travel_time` is part of the `gpf_get_features` query contract the proxy must
 * honour — it is not an optional capability. The engine stays isochrone-agnostic
 * (pure, network-free, testable), exactly as it is for `wfsClient`.
 */
export type TravelTimeResolver = (input: GpfGetFeaturesInput) => Promise<ResolvedFeatureGeometryRef>;

/**
 * Dependencies injected into {@link runGeometryFeatureQuery}.
 */
export type GeometryFeatureQueryDeps = {
  wfsClient: WfsClientLike;
  /** Isochrone resolver, invoked only for `travel_time` filters. */
  resolveTravelTime: TravelTimeResolver;
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
 * Rejects an upstream 2xx body that is not a usable GeoJSON FeatureCollection.
 *
 * The proxy fetch path returns raw text with no schema check (unlike the LLM
 * path's `parseJsonResponse`), so a 200-with-error-body (an OWS/JSON exception
 * envelope served with a 200 status), an empty `{}`, or any off-contract JSON
 * would otherwise reach Carto as a valid-looking layer.
 *
 * Thrown as a {@link ServiceResponseError} (→ HTTP 502, an UPSTREAM anomaly) and
 * NOT a plain Error (which `server.ts` would map to a misleading 500). A
 * best-effort {@link extractJsonServiceError} pass records the real cause
 * SERVER-SIDE: a 200-with-error-body surfaces its OWS `code`/`detail`, anything
 * else a body preview — so the distinct failure modes are traceable in the logs.
 * The client still receives the fixed generic message (no upstream leak), the
 * distinction lives only in the trace.
 *
 * @param featureCollection Raw parsed upstream body.
 * @param typename Layer being queried, for the server-side diagnostic.
 */
function assertUsableFeatureCollection(
  featureCollection: WfsFeatureCollectionResponse,
  typename: string,
): void {
  if (
    featureCollection?.type === "FeatureCollection" &&
    Array.isArray(featureCollection.features)
  ) {
    return;
  }

  const { code, detail } = extractJsonServiceError(featureCollection);
  throw new ServiceResponseError(
    `Le service WFS n'a pas retourné une FeatureCollection GeoJSON exploitable pour '${typename}' (cause amont : ${detail}${code ? `, code : ${code}` : ""}).`,
    {
      http: { status: 502, statusText: "Bad Gateway" },
      service: { code: code ?? "invalid_upstream_body", detail },
    },
  );
}

/**
 * Resolves the reference feature geometry for an `intersects_feature` filter,
 * using the injected client (a second upstream call). Returns `undefined` when
 * the input does not use `intersects_feature`.
 *
 * DIVERGENCE FROM THE LLM PATH: the MCP flow rejects a same-typename
 * `intersects_feature` (`ensureIntersectsFeatureTargetsOtherTypename`) to steer
 * the model toward `gpf_get_feature_by_id` for a single object. That is an
 * LLM-ergonomics concern with no meaning for a map layer: displaying "feature X
 * plus its same-type neighbours" is a legitimate cartographic request, so the
 * proxy deliberately allows it and does not reuse that guard.
 *
 * Assumes at most one spatial filter (enforced upstream by the layer schema's
 * `assertSpatialFilterExclusion`): `getSpatialFilter` returns the first filter in
 * key order, so a same-input combination would silently ignore the others.
 *
 * @param input Normalized layer query input.
 * @param wfsClient Injected WFS client.
 * @returns The resolved reference geometry as EWKT, or `undefined`.
 */
async function resolveReferenceGeometry(
  input: GpfGetFeaturesInput,
  deps: GeometryFeatureQueryDeps,
): Promise<ResolvedFeatureGeometryRef | undefined> {
  const spatialFilter = getSpatialFilter(input);

  // travel_time is resolved by the injected isochrone resolver, up front, so
  // compileQueryParts never sees an unresolved ref (symmetric to intersects_feature).
  if (spatialFilter?.operator === "travel_time") {
    return deps.resolveTravelTime(input);
  }

  if (!spatialFilter || spatialFilter.operator !== "intersects_feature") {
    return undefined;
  }

  return resolveFeatureGeometryEwkt(deps.wfsClient, {
    typename: spatialFilter.typename,
    feature_id: spatialFilter.feature_id,
  });
}

// --- Get Features Public Engine ---

/**
 * Executes a layer feature query and returns the RAW FeatureCollection with full
 * geometry (for map rendering by MCP Carto).
 *
 * Reuses the query-compilation primitives, forces the geometry column into the
 * request, requests WGS84 (`EPSG:4326`, [lon, lat]) to match the `/gpf` modules'
 * convention, and returns the untransformed WFS response — never trimmed.
 *
 * @param input Validated layer query input (same shape as `gpf_get_features`
 *   minus the LLM-only `spatial_extras` knob).
 * @param deps Injected WFS client (catalog + execution) and isochrone resolver
 *   (always required; invoked only for `travel_time` filters).
 * @returns The raw WFS FeatureCollection, geometry preserved.
 */
export async function runGeometryFeatureQuery(
  input: GpfGetFeaturesInput,
  deps: GeometryFeatureQueryDeps,
): Promise<WfsFeatureCollectionResponse> {
  const { wfsClient } = deps;
  const featureType: Collection = await wfsClient.getFeatureType(input.typename);
  const geometryProperty = getGeometryProperty(featureType);

  const resolvedGeometryRef = await resolveReferenceGeometry(input, deps);
  const compiled = compileQueryParts(input, featureType, resolvedGeometryRef);

  const request = buildMainRequest(input, {
    cqlFilter: compiled.cqlFilter,
    propertyName: ensureGeometrySelected(compiled.propertyName, geometryProperty),
    sortBy: compiled.sortBy,
  });

  // Request WGS84 lon/lat, matching the convention the /gpf modules already
  // consume. Set it on request.query, which the proxy transport serializes into
  // the fetch URL.
  request.query.srsName = "EPSG:4326";

  let featureCollection: WfsFeatureCollectionResponse;
  try {
    featureCollection = await wfsClient.fetchFeatureCollection(request);
  } catch (error: unknown) {
    // Catalog desync: the proxy forces the embedded catalog's geometry column into
    // the request (ensureGeometrySelected), so if the live WFS uses a different geom
    // name for this type it rejects it as "Illegal property name". Rewrite it into a
    // clear diagnostic (shared with the LLM path) rather than letting the raw
    // upstream string surface to Carto as an opaque 502.
    rewriteIllegalGeometryColumnError(error, geometryProperty.name, input.typename);
    throw error;
  }

  // Reject an off-contract 2xx body before serving it as a map layer (see the
  // helper: 200-with-error-body / `{}` / non-FeatureCollection → traced 502).
  assertUsableFeatureCollection(featureCollection, input.typename);

  return featureCollection;
}

// --- By-id Public Engine ---

/**
 * Dependencies injected into {@link runGeometryFeatureByIdQuery}. Narrower than
 * {@link GeometryFeatureQueryDeps}: a by-id lookup has no filters, so it never
 * resolves a reference geometry and needs no isochrone resolver.
 */
export type GeometryFeatureByIdQueryDeps = {
  wfsClient: WfsClientLike;
};

/**
 * Executes a single-feature by-id lookup and returns the RAW FeatureCollection
 * with full geometry (for map rendering by MCP Carto).
 *
 * Counterpart of {@link runGeometryFeatureQuery} for the by-id producer tool:
 * - fetches exactly one feature by its WFS `featureID`;
 * - validates an optional `select` against the embedded catalog and appends the
 *   geometry column; without `select`, omits `propertyName` so every property is
 *   returned;
 * - requests WGS84 (`EPSG:4326`, [lon, lat]) like the query path;
 * - enforces strict cardinality (0 or >1 results throw);
 * - returns the untransformed single-feature collection — never `attachFeatureRefs`
 *   (which would null the geometry).
 *
 * @param input Validated by-id layer input (`{ typename, feature_id, select? }`).
 * @param deps Injected WFS client (catalog + execution).
 * @returns The raw WFS FeatureCollection with the single matching feature.
 */
export async function runGeometryFeatureByIdQuery(
  input: GpfGetFeatureByIdLayerInput,
  deps: GeometryFeatureByIdQueryDeps,
): Promise<WfsFeatureCollectionResponse> {
  const { wfsClient } = deps;
  const featureType: Collection = await wfsClient.getFeatureType(input.typename);

  // Validate `select` against the same embedded catalog used at URL generation,
  // then force the geometry column into the WFS selection. Re-validating here is
  // required because decoded proxy tokens remain untrusted input.
  const propertyName = buildPropertyName(featureType, {
    includeGeometry: true,
    select: input.select,
  });
  const request = buildGetFeatureByIdRequest(
    input.typename,
    input.feature_id,
    propertyName,
  );

  // Request WGS84 lon/lat, matching the query path and the /gpf convention. Set it
  // on request.query, which the proxy transport serializes into the fetch URL.
  request.query.srsName = "EPSG:4326";

  const featureCollection = await wfsClient.fetchFeatureCollection(request);

  // Off-contract-body guard, mirroring runGeometryFeatureQuery: reject a
  // 200-with-error-body before requireSingleFeatureById (which only checks the
  // features array), so Carto never receives a valid-looking bad layer.
  assertUsableFeatureCollection(featureCollection, input.typename);

  const firstFeature = requireSingleFeatureById(featureCollection, {
    typename: input.typename,
    feature_id: input.feature_id,
  });

  return {
    ...featureCollection,
    features: [firstFeature],
    totalFeatures: 1,
    numberReturned: 1,
    numberMatched: 1,
  };
}
