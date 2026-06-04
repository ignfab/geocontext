/**
 * WFS client facade for the structured WFS engine.
 *
 * This module provides `WfsClient`, a facade that composes:
 * - a `WfsSchemaStore` for feature-type catalog lookups
 * - a `WfsTransport` for rate-limited HTTP execution
 *
 * A default singleton `wfsClient` is exported for normal usage.
 * Consumers that need different rate limits or test doubles can
 * instantiate their own `WfsClient` with custom dependencies.
 */

import type { CompiledRequest } from "./request.js";
import { buildMultiTypenameRequest } from "./request.js";
import type { Collection } from "@ignfab/gpf-schema-store";
import type { WfsFeatureCollectionResponse } from "./types.js";
import { wfsSchemaStore } from "./catalog.js";
import { WfsTransport } from "./transport.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

// --- Multi-typename Input ---

/**
 * Input parameters for multi-typename WFS execution.
 */
export type MultiTypenameExecutionInput = {
  /** Fully qualified WFS type names to query. */
  typenames: string[];
  /** Pre-compiled CQL filter string, when one shared filter is intentionally reused for all typenames. */
  cqlFilter?: string;
  /** Pre-compiled CQL filters aligned with `typenames` (same length, same order). */
  cqlFilters?: string[];
  /** Service label used in error messages. */
  errorLabel: string;
};

// --- WfsClient Dependencies ---

export type WfsTransportLike = {
  post(request: CompiledRequest): Promise<WfsFeatureCollectionResponse>;
};

export type WfsSchemaStoreLike = {
  getFeatureType(typename: string): Promise<Collection>;
};

// --- WfsClient Facade ---

/**
 * Facade composing a schema store (catalog) and a transport (rate-limited HTTP).
 *
 * Provides the minimal surface consumed by the WFS engine modules:
 * - `getFeatureType`: load a feature type from the embedded catalog
 * - `fetchFeatureCollection`: execute a compiled WFS request
 * - `fetchMultiTypename`: multi-typename execution with response validation
 */
export class WfsClient {
  constructor(
    private transport: WfsTransportLike,
    private schemaStore: WfsSchemaStoreLike,
  ) {}

  /**
   * Loads a WFS feature type description from the embedded catalog.
   */
  async getFeatureType(typename: string) {
    return this.schemaStore.getFeatureType(typename);
  }

  /**
   * Executes a compiled WFS request as POST and returns the JSON FeatureCollection.
   */
  async fetchFeatureCollection(request: CompiledRequest): Promise<WfsFeatureCollectionResponse> {
    return this.transport.post(request);
  }

  /**
   * Executes a WFS GetFeature request targeting multiple typenames.
   *
   * Uses the WFS 2.0.0 multi-typename format expected by GeoServer:
   * - `typeNames=(type1)(type2)...`
   * - `cql_filter=filter1;filter2;...`
   */
  async fetchMultiTypename(
    input: MultiTypenameExecutionInput,
  ): Promise<WfsFeatureCollectionResponse> {
    const request = buildMultiTypenameRequest({
      typenames: input.typenames,
      cqlFilter: input.cqlFilter,
      cqlFilters: input.cqlFilters,
    });

    const featureCollection = await this.transport.post(request);

    if (!Array.isArray(featureCollection?.features)) {
      throw new Error(
        `Le service ${input.errorLabel} n'a pas retourné de collection d'objets exploitable`,
      );
    }

    return featureCollection;
  }
}

// --- Default Singleton ---

/**
 * Default WFS client with GPF rate limiting.
 * https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/limites-d-usage/
 */
export const wfsClient = new WfsClient(
  new WfsTransport(
    new RateLimiter({ name: "GPF_WFS", maxCalls: getEnv().GPF_WFS_RATE_LIMIT, period: 1 }),
  ),
  wfsSchemaStore,
);
