/**
 * Geodata proxy transport and client.
 *
 * The proxy needs the SAME catalog + compilation façade as the LLM path but a
 * DIFFERENT execution: size-bounded reads (`fetchJSONPostWithLimit`), a dedicated
 * rate limiter (`GPF_WFS_PROXY`), a shorter upstream timeout, and full-geometry
 * output. So it reuses the existing `WfsClient` façade (which is designed for
 * transport injection) with a proxy `WfsTransportLike`, rather than duplicating it.
 */

import { WfsClient } from "../wfs/execution.js";
import { wfsSchemaStore } from "../wfs/catalog.js";
import type { WfsTransportLike } from "../wfs/execution.js";
import type { CompiledRequest } from "../wfs/request.js";
import type { WfsFeatureCollectionResponse } from "../wfs/types.js";
import { getSpatialFilter } from "../wfs/queryPreparation.js";
import type { GpfGetFeaturesInput } from "../wfs/schema.js";
import { NavigationIsolineClient } from "../gpf/navigation.js";
import { NavigationItineraryClient } from "../gpf/itinerary.js";
import type {
  IsolineResolver,
  GeometryFeatureQueryDeps,
  GeometryFeatureByIdQueryDeps,
  GeometryIsolineQueryDeps,
  GeometryItineraryQueryDeps,
} from "./execute.js";
import { fetchJSONPostWithLimit, fetchJSONGetWithLimit } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";
import type { Geometry } from "geojson";

// --- Proxy Transport ---

/**
 * Builds a `WfsTransportLike` that executes compiled WFS requests through the
 * size-bounded, dedicated-rate-limited proxy path.
 *
 * @param rateLimiter Dedicated proxy rate limiter (`GPF_WFS_PROXY`).
 * @returns A transport whose `post` returns the parsed FeatureCollection.
 */
function buildProxyTransport(rateLimiter: RateLimiter): WfsTransportLike {
  return {
    async post(request: CompiledRequest): Promise<WfsFeatureCollectionResponse> {
      await rateLimiter.limit();

      const env = getEnv();
      const url = `${request.url}?${new URLSearchParams(request.query).toString()}`;
      // Bounded fetch + JSON parse + 502-on-bad-body all live in fetchJSONPostWithLimit
      // (symmetric to the isoline leg's fetchJSONGetWithLimit). It already throws on
      // non-2xx, on the byte cap, and on a 2xx body that is not JSON (→ 502,
      // invalid_upstream_body, labelled "WFS"). runGeometryFeatureQuery validates the
      // resulting shape (FeatureCollection + features array).
      return fetchJSONPostWithLimit<WfsFeatureCollectionResponse>(
        url,
        request.body,
        {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        env.PROXY_UPSTREAM_TIMEOUT * 1000,
        env.PROXY_MAX_RESPONSE_BYTES,
        "WFS",
      );
    },
  };
}

// --- Geodata proxy Client (singleton) ---

let cachedProxyWfsClient: WfsClient | undefined;

/**
 * Returns the geodata proxy client: the shared `WfsClient` façade wired to the proxy
 * transport (bounded fetch + `GPF_WFS_PROXY` rate limit) and the embedded catalog.
 * Lazily built so the rate limit is read from a fully-parsed environment.
 */
export function getProxyWfsClient(): WfsClient {
  cachedProxyWfsClient ??= new WfsClient(
    buildProxyTransport(
      new RateLimiter({ name: "GPF_WFS_PROXY", maxCalls: getEnv().GPF_WFS_PROXY_RATE_LIMIT, period: 1 }),
    ),
    wfsSchemaStore,
  );
  return cachedProxyWfsClient;
}

// --- Proxy navigation rate limiter (singleton) ---

let cachedProxyNavigationRateLimiter: RateLimiter | undefined;

/**
 * Returns the proxy's shared navigation rate limiter.
 */
function getProxyNavigationRateLimiter(): RateLimiter {
  cachedProxyNavigationRateLimiter ??= new RateLimiter({
    name: "GPF_NAVIGATION_PROXY",
    maxCalls: getEnv().GPF_NAVIGATION_PROXY_RATE_LIMIT,
    period: 1,
  });
  return cachedProxyNavigationRateLimiter;
}

// --- Proxy Isoline Client (singleton) ---

let cachedProxyIsolineClient: NavigationIsolineClient | undefined;

/**
 * Returns the proxy isoline client: a dedicated `NavigationIsolineClient`
 * wired to the SAME size-bounded, shorter-timeout fetch the geodata proxy leg uses
 * (`PROXY_UPSTREAM_TIMEOUT` + `PROXY_MAX_RESPONSE_BYTES`) and the shared
 * `GPF_NAVIGATION_PROXY` rate limiter — NOT the default `navigationIsolineClient`
 * singleton, which uses the unbounded `HTTP_TIMEOUT`-only `fetchJSONGet`. This
 * keeps both upstream legs of an `isoline` layer request under the same bounds,
 * so its worst case matches `intersects_feature` (2 × PROXY_UPSTREAM_TIMEOUT).
 * Lazily built so the bounds are read from a fully-parsed environment.
 */
function getProxyIsolineClient(): NavigationIsolineClient {
  cachedProxyIsolineClient ??= new NavigationIsolineClient(
    getProxyNavigationRateLimiter(),
    (url) => fetchJSONGetWithLimit(url, getEnv().PROXY_UPSTREAM_TIMEOUT * 1000, getEnv().PROXY_MAX_RESPONSE_BYTES, "d'isochrone"),
  );
  return cachedProxyIsolineClient;
}

// --- Reference-geometry resolver ---

/**
 * Reference-geometry resolver for the `isoline` spatial filter: turns the
 * isoline into a reference geometry that is fed INTO the WFS query — the
 * sibling of `intersects_feature`'s reference-geometry resolution
 * (`resolveFeatureGeometry`). It does NOT fetch features itself (that is the
 * WFS transport's job). Backed by the proxy isoline client (bounded fetch +
 * `GPF_NAVIGATION_PROXY` rate limiter), and injected into `runGeometryFeatureQuery`
 * so it only fires for isoline inputs.
 */
export const resolveProxyIsolineGeometry: IsolineResolver = async (
  input: GpfGetFeaturesInput,
): Promise<Geometry> => {
  const spatialFilter = getSpatialFilter(input);
  if (spatialFilter?.operator !== "isoline") {
    // Guarded by the caller (runGeometryFeatureQuery only calls this for isoline);
    // defensive check keeps the type narrow.
    throw new Error("resolveProxyIsolineGeometry appelé sans filtre `isoline`.");
  }

  const { operator, ...parameters } = spatialFilter;

  return await getProxyIsolineClient().getIsoline(parameters);
};

// --- Default Engine Dependencies ---

/**
 * Default (production) dependency bundle for `runGeometryFeatureQuery`: the proxy
 * WFS client and the proxy isoline resolver. Bundling the concrete proxy wiring
 * here keeps `server.ts` decoupled from the individual clients — it asks the
 * transport layer for "the deps" instead of assembling them itself. Tests inject
 * their own deps into the engine directly.
 */
export function getDefaultGeometryFeatureQueryDeps(): GeometryFeatureQueryDeps {
  return {
    wfsClient: getProxyWfsClient(),
    resolveIsoline: resolveProxyIsolineGeometry,
  };
}

/**
 * Default (production) dependency bundle for `runGeometryFeatureByIdQuery`.
 * Narrower than {@link getDefaultGeometryFeatureQueryDeps}: a by-id lookup has no
 * spatial filter, so it needs only the WFS client (no isoline resolver).
 */
export function getDefaultGeometryFeatureByIdQueryDeps(): GeometryFeatureByIdQueryDeps {
  return {
    wfsClient: getProxyWfsClient(),
  };
}

/**
 * Default dependency bundle for `runGeometryIsolineQuery`.
 */
export function getDefaultGeometryIsolineQueryDeps(): GeometryIsolineQueryDeps {
  return {
    getGeometry: (input) => getProxyIsolineClient().getIsoline(input),
  };
}

// --- Proxy Itinerary Client (singleton) ---

let cachedProxyItineraryClient: NavigationItineraryClient | undefined;

/**
 * Returns the proxy itinerary client: a dedicated `NavigationItineraryClient`
 * wired to the size-bounded, shorter-timeout fetch the geodata proxy leg uses and the
 * `GPF_NAVIGATION_PROXY` rate limiter it shares with the proxy isoline client.
 * Lazily built so the bounds are read from a fully-parsed environment.
 */
function getProxyItineraryClient(): NavigationItineraryClient {
  cachedProxyItineraryClient ??= new NavigationItineraryClient(
    getProxyNavigationRateLimiter(),
    (url) => fetchJSONGetWithLimit(url, getEnv().PROXY_UPSTREAM_TIMEOUT * 1000, getEnv().PROXY_MAX_RESPONSE_BYTES, "d'itinéraire"),
  );
  return cachedProxyItineraryClient;
}

/**
 * Default dependency bundle for `runGeometryItineraryQuery`.
 */
export function getDefaultGeometryItineraryQueryDeps(): GeometryItineraryQueryDeps {
  return {
    getItineraryLayer: (input) =>
      getProxyItineraryClient().getItineraryLayer(input),
  };
}
