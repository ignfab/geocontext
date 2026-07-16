/**
 * Proxy WFS transport and client.
 *
 * The proxy needs the SAME catalog + compilation façade as the LLM path but a
 * DIFFERENT execution: size-bounded reads (`fetchTextPostWithLimit`), a dedicated
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
import type { TravelTimeResolver } from "./execute.js";
import { fetchTextPostWithLimit, fetchJSONGetWithLimit, ServiceResponseError } from "../helpers/http.js";
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
      const text = await fetchTextPostWithLimit(
        url,
        request.body,
        {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        env.PROXY_UPSTREAM_TIMEOUT * 1000,
        env.PROXY_MAX_RESPONSE_BYTES,
      );

      // fetchTextPostWithLimit already threw on non-2xx and on the byte cap; here we
      // only turn the bounded text into JSON. runGeometryFeatureQuery validates the
      // resulting shape (FeatureCollection + features array).
      // A 2xx body that is not JSON (HTML error page, XML, truncated) is a bad
      // UPSTREAM response, not a proxy bug — surface it as a ServiceResponseError
      // (mapped to 502), not the generic 500 fallback.
      try {
        return JSON.parse(text) as WfsFeatureCollectionResponse;
      } catch {
        throw new ServiceResponseError(
          "Le service WFS a renvoyé un corps 2xx qui n'est pas du JSON exploitable.",
          { http: { status: 502, statusText: "Bad Gateway" }, service: { code: "invalid_upstream_body" } },
        );
      }
    },
  };
}

// --- Proxy WFS Client (singleton) ---

let cachedProxyWfsClient: WfsClient | undefined;

/**
 * Returns the proxy WFS client: the shared `WfsClient` façade wired to the proxy
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
 * wired to the SAME size-bounded, shorter-timeout fetch the proxy WFS leg uses
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
    (url) => fetchJSONGetWithLimit(url, getEnv().PROXY_UPSTREAM_TIMEOUT * 1000, getEnv().PROXY_MAX_RESPONSE_BYTES),
  );
  return cachedProxyIsochroneClient;
}

// --- Isochrone Resolver ---

/**
 * Resolves the isochrone geometry for a `travel_time` filter into EWKT, via the
 * proxy isochrone client (bounded fetch + `GPF_NAVIGATION_PROXY` rate limiter).
 * Injected into `runGeometryFeatureQuery` so it only fires for travel_time inputs.
 */
export const resolveProxyTravelTime: TravelTimeResolver = async (
  input: GpfGetFeaturesInput,
): Promise<ResolvedFeatureGeometryRef> => {
  const spatialFilter = getSpatialFilter(input);
  if (spatialFilter?.operator !== "travel_time") {
    // Guarded by the caller (runGeometryFeatureQuery only calls this for travel_time);
    // defensive check keeps the type narrow.
    throw new Error("resolveProxyTravelTime appelé sans filtre `travel_time`.");
  }

  const geometry = await getProxyIsochroneClient().getTravelTimeGeometry({
    lon: spatialFilter.lon,
    lat: spatialFilter.lat,
    minutes: spatialFilter.minutes,
    profile: spatialFilter.profile,
  });

  return { geometry_ewkt: geometryToEwkt(geometry) };
};
