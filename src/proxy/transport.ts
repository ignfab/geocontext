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
import { getSpatialFilter, geometryToEwkt } from "../wfs/queryPreparation.js";
import type { ResolvedFeatureGeometryRef } from "../wfs/queryPreparation.js";
import type { GpfGetFeaturesInput } from "../wfs/schema.js";
import { NavigationIsochroneClient } from "../gpf/navigation.js";
import type {
  TravelTimeResolver,
  GeometryFeatureQueryDeps,
  GeometryFeatureByIdQueryDeps,
} from "./execute.js";
import { fetchJSONPostWithLimit, fetchJSONGetWithLimit } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

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
      // (symmetric to the isochrone leg's fetchJSONGetWithLimit). It already throws on
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

// --- Proxy Isochrone Client (singleton) ---

let cachedProxyIsochroneClient: NavigationIsochroneClient | undefined;

/**
 * Returns the proxy isochrone client: a dedicated `NavigationIsochroneClient`
 * wired to the SAME size-bounded, shorter-timeout fetch the geodata proxy leg uses
 * (`PROXY_UPSTREAM_TIMEOUT` + `PROXY_MAX_RESPONSE_BYTES`) and its own
 * `GPF_NAVIGATION_PROXY` rate limiter — NOT the default `navigationIsochroneClient`
 * singleton, which uses the unbounded `HTTP_TIMEOUT`-only `fetchJSONGet`. This
 * keeps both upstream legs of a `travel_time` layer request under the same bounds,
 * so its worst case matches `intersects_feature` (2 × PROXY_UPSTREAM_TIMEOUT).
 * Lazily built so the bounds are read from a fully-parsed environment.
 */
function getProxyIsochroneClient(): NavigationIsochroneClient {
  cachedProxyIsochroneClient ??= new NavigationIsochroneClient(
    new RateLimiter({ name: "GPF_NAVIGATION_PROXY", maxCalls: getEnv().GPF_NAVIGATION_PROXY_RATE_LIMIT, period: 1 }),
    (url) => fetchJSONGetWithLimit(url, getEnv().PROXY_UPSTREAM_TIMEOUT * 1000, getEnv().PROXY_MAX_RESPONSE_BYTES, "d'isochrone"),
  );
  return cachedProxyIsochroneClient;
}

// --- Reference-geometry resolver (travel_time / isochrone) ---

/**
 * Reference-geometry resolver for the `travel_time` spatial filter: turns the
 * isochrone into a reference geometry (EWKT) that is fed INTO the WFS query — the
 * sibling of `intersects_feature`'s reference-geometry resolution
 * (`resolveFeatureGeometryEwkt`). It does NOT fetch features itself (that is the
 * WFS transport's job). Backed by the proxy isochrone client (bounded fetch +
 * `GPF_NAVIGATION_PROXY` rate limiter), and injected into `runGeometryFeatureQuery`
 * so it only fires for travel_time inputs.
 */
export const resolveProxyTravelTimeGeometry: TravelTimeResolver = async (
  input: GpfGetFeaturesInput,
): Promise<ResolvedFeatureGeometryRef> => {
  const spatialFilter = getSpatialFilter(input);
  if (spatialFilter?.operator !== "travel_time") {
    // Guarded by the caller (runGeometryFeatureQuery only calls this for travel_time);
    // defensive check keeps the type narrow.
    throw new Error("resolveProxyTravelTimeGeometry appelé sans filtre `travel_time`.");
  }

  const geometry = await getProxyIsochroneClient().getTravelTimeGeometry({
    lon: spatialFilter.lon,
    lat: spatialFilter.lat,
    minutes: spatialFilter.minutes,
    profile: spatialFilter.profile,
  });

  return { geometry_ewkt: geometryToEwkt(geometry) };
};

// --- Default Engine Dependencies ---

/**
 * Default (production) dependency bundle for `runGeometryFeatureQuery`: the proxy
 * WFS client and the proxy isochrone resolver. Bundling the concrete proxy wiring
 * here keeps `server.ts` decoupled from the individual clients — it asks the
 * transport layer for "the deps" instead of assembling them itself. Tests inject
 * their own deps into the engine directly.
 */
export function getDefaultGeometryFeatureQueryDeps(): GeometryFeatureQueryDeps {
  return {
    wfsClient: getProxyWfsClient(),
    resolveTravelTime: resolveProxyTravelTimeGeometry,
  };
}

/**
 * Default (production) dependency bundle for `runGeometryFeatureByIdQuery`.
 * Narrower than {@link getDefaultGeometryFeatureQueryDeps}: a by-id lookup has no
 * spatial filter, so it needs only the WFS client (no isochrone resolver).
 */
export function getDefaultGeometryFeatureByIdQueryDeps(): GeometryFeatureByIdQueryDeps {
  return {
    wfsClient: getProxyWfsClient(),
  };
}
