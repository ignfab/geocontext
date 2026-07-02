/**
 * WFS request builders used by the structured WFS engine.
 *
 * This module centralizes:
 * - the transport shape shared by compiled requests
 * - GET/POST request assembly helpers
 * - the compact HTTP payloads exposed by MCP WFS tools
 */

import { GPF_WFS_URL } from "./catalog.js";
import type { GpfQueryFeaturesInput } from "./schema.js";

// --- Transport Types ---

type WfsRequestTransport = {
  method: "POST";
  url: string;
  query: Record<string, string>;
  body: string;
};

export type CompiledRequest = WfsRequestTransport & {
  get_url: string;
};

export type WfsHttpPostRequestPayload = {
  result_type: "http_post_request";
  http_post_request: {
    method: "POST";
    url: string;
    headers: { "Content-Type": "application/x-www-form-urlencoded" };
    body: string;
  };
};

export type WfsHttpGetUrlPayload = {
  result_type: "http_get_url";
  http_get_url: string;
};

// --- Request Payload Mapping ---

/**
 * Builds a full URL from base endpoint and query parameters.
 *
 * @param url Base WFS endpoint URL.
 * @param query Query-string parameters sent with the request.
 * @returns URL with encoded query-string parameters.
 */
function buildUrlWithQuery(url: string, query: Record<string, string>) {
  return `${url}?${new URLSearchParams(query).toString()}`;
}

/**
 * Maps a compiled WFS request to the compact MCP POST payload.
 *
 * @param request Compiled request ready to be executed against the WFS service.
 * @returns A normalized POST payload exposed by MCP tools.
 */
export function toWfsHttpPostRequestPayload(request: CompiledRequest): WfsHttpPostRequestPayload {
  return {
    result_type: "http_post_request",
    http_post_request: {
      method: request.method,
      url: buildUrlWithQuery(request.url, request.query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: request.body,
    },
  };
}

/**
 * Maps a compiled WFS request to the compact MCP GET URL payload.
 *
 * @param request Compiled request ready to be serialized as an equivalent GET URL.
 * @returns A normalized GET URL payload exposed by MCP tools.
 */
export function toWfsHttpGetUrlPayload(request: CompiledRequest): WfsHttpGetUrlPayload {
  return {
    result_type: "http_get_url",
    http_get_url: request.get_url,
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
 * Builds the equivalent GET URL variant of the request.
 *
 * Consumers should prefer `http_post_request` for robust direct WFS execution
 * when this URL is very long or contains a large `cql_filter`.
 *
 * @param url Base WFS endpoint URL.
 * @param query Query-string parameters sent with the request.
 * @param cqlFilter Optional CQL filter to append to the GET variant.
 * @returns A derived GET URL.
 */
export function buildGetUrl(url: string, query: Record<string, string>, cqlFilter?: string) {
  const params = new URLSearchParams(query);
  if (cqlFilter) {
    params.set("cql_filter", cqlFilter);
  }
  return `${url}?${params.toString()}`;
}

// --- Public Builders ---

/**
 * Builds the main WFS GetFeature or CountFeature request from normalized tool input and compiled query parts.
 *
 * @param input Normalized tool input.
 * @param compiled Compiled query fragments produced from the input and feature type.
 * @returns A POST request split into base URL, query-string parameters, encoded body, and optional GET variant.
 */
export function buildMainRequest(
  input: GpfQueryFeaturesInput,
  compiled: { cqlFilter?: string; propertyName?: string; sortBy?: string },
): CompiledRequest {
  const query: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: input.typename,
    outputFormat: "application/json",
    exceptions: "application/json",
    count: "limit" in input ? String(input.limit) : "1"
  };

  if (compiled.propertyName) {
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
    exceptions: "application/json",
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

// --- Multi-typename Request ---

/**
 * Input parameters for building a multi-typename WFS request.
 */
export type MultiTypenameRequestInput = {
  /** Fully qualified WFS type names to query. */
  typenames: string[];
  /** Pre-compiled CQL filter string, when one shared filter is intentionally reused for all typenames. */
  cqlFilter?: string;
  /** Pre-compiled CQL filters aligned with `typenames` (same length, same order). */
  cqlFilters?: string[];
};

/**
 * Builds a WFS GetFeature request targeting multiple typenames.
 *
 * Unlike `buildMainRequest()`, this builder accepts a raw CQL filter
 * and a list of typenames, making it suitable for domain-oriented modules
 * that query several layers at once.
 *
 * @param input Multi-typename request parameters.
 * @returns A POST request split into base URL, query-string parameters, encoded body, and optional GET variant.
 */
export function buildMultiTypenameRequest(
  input: MultiTypenameRequestInput,
): CompiledRequest {
  if (input.cqlFilter && input.cqlFilters) {
    throw new Error("`cqlFilter` et `cqlFilters` ne peuvent pas être utilisés ensemble.");
  }
  if (input.cqlFilters && input.cqlFilters.length !== input.typenames.length) {
    throw new Error(
      `Le nombre de filtres CQL (${input.cqlFilters.length}) doit correspondre au nombre de typenames (${input.typenames.length}).`,
    );
  }

  const encodedTypeNames = input.typenames.map((typename) => `(${typename})`).join("");

  const expandedCqlFilter = input.cqlFilters
    ? input.cqlFilters.join(";")
    : input.cqlFilter
      ? input.typenames.map(() => input.cqlFilter).join(";")
      : undefined;

  const query: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: encodedTypeNames,
    outputFormat: "application/json",
    exceptions: "application/json",
    srsName: "EPSG:4326",
  };

  const body = expandedCqlFilter
    ? new URLSearchParams({ cql_filter: expandedCqlFilter }).toString()
    : "";

  return {
    method: "POST",
    url: GPF_WFS_URL,
    query,
    body,
    get_url: buildGetUrl(GPF_WFS_URL, query, expandedCqlFilter),
  };
}
