/**
 * Shared detection + rewrite of the "embedded catalog is desynchronised" failure.
 *
 * Both feature-query paths force the embedded catalog's geometry column into the
 * WFS request (the LLM path via `compileQueryParts`, the proxy path via
 * `ensureGeometrySelected`). If the LIVE WFS uses a different geometry column name
 * for that type, it rejects the request with an `InvalidParameterValue` /
 * `Illegal property name: <geom>` error. Left raw, that surfaces as an opaque 502;
 * rewritten, it tells the operator the embedded catalog is probably stale.
 *
 * Owned here (client-agnostic) so the LLM path (`executeQueryFeatures`) and the
 * proxy path (`runGeometryFeatureQuery`) share ONE detection string + message —
 * mirroring `resolveFeatureGeometryEwkt`. A maintainer updating the upstream
 * wording (or the diagnostic) then touches a single place instead of two copies
 * that can silently drift.
 */

import { ServiceResponseError } from "../helpers/http.js";

/**
 * Rethrows a WFS "Illegal property name: <geometry column>" rejection as a clear
 * catalog-desync diagnostic. A no-op for any other error, so the caller re-throws
 * the original afterwards (`rethrowIdentifiedCatalogDesyncError(...); throw error;`).
 *
 * @param error Error thrown by the WFS fetch.
 * @param geometryPropertyName Geometry column forced into the request from the embedded catalog.
 * @param typename Layer being queried, for the diagnostic.
 * @throws {Error} A catalog-desync diagnostic when the error matches; otherwise returns.
 */
export function rethrowIdentifiedCatalogDesyncError(
  error: unknown,
  geometryPropertyName: string,
  typename: string,
): void {
  if (
    error instanceof ServiceResponseError &&
    error.serviceCode === "InvalidParameterValue" &&
    error.serviceDetail === `Illegal property name: ${geometryPropertyName}`
  ) {
    throw new Error(
      `Le champ géométrique '${geometryPropertyName}' issu du catalogue embarqué est rejeté par le WFS live pour '${typename}'. Le catalogue embarqué est probablement désynchronisé. Détail : ${error.message}`,
    );
  }
}
