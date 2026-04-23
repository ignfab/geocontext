/**
 * WFS request builders used by the structured WFS engine.
 *
 * This module centralizes:
 * - the transport shape shared by compiled requests
 * - GET/POST request assembly helpers
 * - the compact request payload exposed by MCP `result_type="request"`
 */

import { GPF_WFS_URL } from "../../gpf/wfs-schema-catalog.js";
import type { GpfWfsGetFeaturesInput } from "./schema.js";
import { REQUEST_GET_URL_MAX_LENGTH } from "./schema.js";

// --- Transport Types ---

type WfsRequestTransport = {
  method: "POST";
  url: string;
  query: Record<string, string>;
  body: string;
};

export type CompiledRequest = WfsRequestTransport & {
  get_url?: string | null;
};

export type WfsRequestPayload = WfsRequestTransport & {
  result_type: "request";
  get_url: string | null;
};

// --- Request Payload Mapping ---

/**
 * Maps a compiled WFS request to the compact MCP request payload.
 *
 * @param request Compiled request ready to be executed against the WFS service.
 * @returns A normalized request payload exposed by MCP tools.
 */
export function toWfsRequestPayload(request: CompiledRequest): WfsRequestPayload {
  return {
    result_type: "request",
    method: request.method,
    url: request.url,
    query: request.query,
    body: request.body,
    get_url: request.get_url ?? null,
  };
}

// --- Request Assembly Helpers ---

/**
 * Encodes the optional CQL filter as an `application/x-www-form-urlencoded` POST body.
 *
 * @param cqlFilter Compiled CQL filter, when the request needs one.
 * @returns The encoded POST body, or an empty string when no filter is present.
 */
function buildBody(cqlFilter?: string) {
  if (!cqlFilter) {
    return "";
  }
  return new URLSearchParams({ cql_filter: cqlFilter }).toString();
}

/**
 * Builds a portable GET URL variant of the request when it stays below the configured limit.
 *
 * This helper is mainly used to populate `get_url` in request payloads
 * returned by `result_type="request"`.
 *
 * @param url Base WFS endpoint URL.
 * @param query Query-string parameters sent with the request.
 * @param cqlFilter Optional CQL filter to append to the GET variant.
 * @returns A derived GET URL, or `null` when it would be too long to expose safely.
 */
export function buildGetUrl(url: string, query: Record<string, string>, cqlFilter?: string) {
  const params = new URLSearchParams(query);
  if (cqlFilter) {
    params.set("cql_filter", cqlFilter);
  }
  const getUrl = `${url}?${params.toString()}`;
  if (getUrl.length > REQUEST_GET_URL_MAX_LENGTH) {
    return null;
  }
  return getUrl;
}

// --- Public Builders ---

/**
 * Builds the main WFS GetFeature request from normalized tool input and compiled query parts.
 *
 * @param input Normalized tool input.
 * @param compiled Compiled query fragments produced from the input and feature type.
 * @returns A POST request split into base URL, query-string parameters, encoded body, and optional GET variant.
 */
export function buildMainRequest(
  input: GpfWfsGetFeaturesInput,
  compiled: { cqlFilter?: string; propertyName?: string; sortBy?: string },
): CompiledRequest {
  const query: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: input.typename,
    outputFormat: "application/json",
    count: input.result_type === "hits" ? "1" : String(input.limit),
  };

  if (compiled.propertyName && input.result_type !== "hits") {
    query.propertyName = compiled.propertyName;
  }
  if (compiled.sortBy) {
    query.sortBy = compiled.sortBy;
  }

  const body = buildBody(compiled.cqlFilter);
  return {
    method: "POST",
    url: GPF_WFS_URL,
    query,
    body,
    get_url: buildGetUrl(GPF_WFS_URL, query, compiled.cqlFilter),
  };
}

/**
 * Builds the auxiliary request used to fetch the geometry of a reference feature.
 *
 * @param typename Typename of the reference layer.
 * @param featureId Identifier of the reference feature.
 * @param geometryPropertyName Geometry property to request from the reference layer.
 * @returns A POST request targeting the reference feature lookup.
 */
export function buildReferenceGeometryRequest(typename: string, featureId: string, geometryPropertyName: string): CompiledRequest {
  const query: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typename,
    outputFormat: "application/json",
    featureID: featureId,
    propertyName: geometryPropertyName,
    count: "1",
  };

  return {
    method: "POST",
    url: GPF_WFS_URL,
    query,
    body: "",
    get_url: buildGetUrl(GPF_WFS_URL, query),
  };
}

/**
 * Builds a GetFeature request targeting exactly one feature by its WFS `featureID`.
 *
 * @param typename Typename of the target layer.
 * @param featureId Identifier of the target feature.
 * @param propertyName Optional comma-separated property list.
 * @returns A POST request split into base URL, query-string parameters, empty body, and optional GET variant.
 */
export function buildGetFeatureByIdRequest(
  typename: string,
  featureId: string,
  propertyName?: string,
): CompiledRequest {
  const query: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typename,
    outputFormat: "application/json",
    featureID: featureId,
    count: "2",
  };

  if (propertyName) {
    query.propertyName = propertyName;
  }

  return {
    method: "POST",
    url: GPF_WFS_URL,
    query,
    body: "",
    get_url: buildGetUrl(GPF_WFS_URL, query),
  };
}
