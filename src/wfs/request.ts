/**
 * WFS request builders used by the structured WFS engine.
 *
 * This module centralizes:
 * - the transport shape shared by compiled requests
 * - POST request assembly helpers
 */

import { GPF_WFS_URL } from "./catalog.js";
import type { GpfQueryFeaturesInput } from "./schema.js";

// --- Transport Types ---

export type CompiledRequest = {
  method: "POST";
  url: string;
  query: Record<string, string>;
  body: string;
};

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

// --- Public Builders ---

/**
 * Builds the main WFS GetFeature or CountFeature request from normalized tool input and compiled query parts.
 *
 * @param input Normalized tool input.
 * @param compiled Compiled query fragments produced from the input and feature type.
 * @returns A POST request split into base URL, query-string parameters, and encoded body.
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
  };
}

/**
 * Builds a GetFeature request targeting exactly one feature by its WFS `featureID`.
 *
 * @param typename Typename of the target layer.
 * @param featureId Identifier of the target feature.
 * @param propertyName Optional comma-separated property list.
 * @returns A POST request split into base URL, query-string parameters, and empty body.
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
 * @returns A POST request split into base URL, query-string parameters, and encoded body.
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
  };
}
