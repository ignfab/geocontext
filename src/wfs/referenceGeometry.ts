/**
 * Resolution of a reference feature's geometry for spatial-filter compilation.
 *
 * `intersects_feature` filters name another feature by id; before the CQL can be
 * compiled, that feature's geometry must be fetched and converted to EWKT. This
 * module owns that single primitive, client-agnostic so both consumers share it:
 * - the LLM path (`resolveIntersectsFeatureGeometry`, on the module singleton);
 * - the proxy engine (`resolveReferenceGeometry`, on its injected, size-bounded
 *   client).
 *
 * It internally performs a by-id fetch, but it is not a by-id *tool* concern
 * (that lives in `byId.ts`) — it is one step of query preparation.
 */

import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";

import {
  getGeometryProperty,
  geometryToEwkt,
  type ResolvedFeatureGeometryRef,
} from "./queryPreparation.js";
import { buildGetFeatureByIdRequest, type CompiledRequest } from "./request.js";
import { requireSingleFeatureById } from "./byId.js";
import type { WfsFeatureCollectionResponse } from "./types.js";

/**
 * Minimal WFS client surface needed to resolve a reference feature's geometry:
 * a catalog lookup plus a single by-id fetch. Both the default singleton
 * `wfsClient` and the proxy engine's injected, size-bounded client satisfy it
 * structurally, so {@link resolveFeatureGeometryEwkt} serves both paths from a
 * single implementation.
 */
export type ReferenceGeometryClient = {
  getFeatureType(typename: string): Promise<OgcCollectionSchema>;
  fetchFeatureCollection(request: CompiledRequest): Promise<WfsFeatureCollectionResponse>;
};

type GeometryLike = {
  type: string;
  coordinates: unknown;
};

/**
 * Narrow guard for the minimal GeoJSON geometry shape `geometryToEwkt` requires.
 *
 * @param value Unknown feature geometry value.
 * @returns `true` when the value looks like a GeoJSON geometry object.
 */
function isGeometryLike(value: unknown): value is GeometryLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "coordinates" in value
  );
}

/**
 * Fetches a single reference feature by id (requesting only its geometry column)
 * and returns its geometry as EWKT, ready for CQL compilation.
 *
 * The caller supplies the WFS client so each path keeps its own transport
 * (module singleton vs injected, size-bounded) without duplicating the
 * lookup/cardinality/geometry-guard logic.
 *
 * @param client WFS client used for the catalog lookup and the by-id fetch.
 * @param ref Target reference feature (layer + expected feature id).
 * @returns The reference geometry as EWKT.
 * @throws When the resolved feature carries no usable geometry.
 */
export async function resolveFeatureGeometryEwkt(
  client: ReferenceGeometryClient,
  ref: { typename: string; feature_id: string },
): Promise<ResolvedFeatureGeometryRef> {
  const referenceFeatureType = await client.getFeatureType(ref.typename);
  const referenceGeometryProperty = getGeometryProperty(referenceFeatureType);
  const request = buildGetFeatureByIdRequest(
    ref.typename,
    ref.feature_id,
    referenceGeometryProperty.name,
  );
  const featureCollection = await client.fetchFeatureCollection(request);
  const referenceFeature = requireSingleFeatureById(featureCollection, ref);

  if (!isGeometryLike(referenceFeature.geometry)) {
    throw new Error(
      `Le feature de référence '${ref.feature_id}' n'a pas de géométrie exploitable.`,
    );
  }

  return { geometry_ewkt: geometryToEwkt(referenceFeature.geometry) };
}
