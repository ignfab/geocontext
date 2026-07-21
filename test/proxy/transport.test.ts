import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CompiledRequest } from "../../src/wfs/request";
import type { GpfGetFeaturesInput } from "../../src/wfs/schema";

// Mock ONLY the I/O boundaries, so the real proxy transport code runs:
// - fetchJSONPostWithLimit (the bounded WFS fetch, parses to JSON) — but keep the real error classes;
// - fetchJSONGetWithLimit (the bounded isochrone fetch) — asserts the travel_time leg
//   goes through the SAME PROXY_UPSTREAM_TIMEOUT + PROXY_MAX_RESPONSE_BYTES bounds as WFS.
//   The real NavigationIsochroneClient runs (only its fetcher is mocked), so this covers
//   the previously-untested gap where the isochrone leg used unbounded fetchJSONGet.
// - RateLimiter (assert it is invoked, without real timing).
// The parse + 502-on-bad-body now lives inside fetchJSON*WithLimit (helpers/http),
// so it is covered there; here we only assert the transport wires the right args.
// All spies live in `vi.hoisted` because the vi.mock factories are hoisted above
// them AND the mocked modules are imported (and RateLimiter constructed) very early.
const { fetchJSONPostWithLimit, fetchJSONGetWithLimit, rateLimit } = vi.hoisted(() => ({
  fetchJSONPostWithLimit: vi.fn(),
  fetchJSONGetWithLimit: vi.fn(),
  rateLimit: vi.fn(async () => {}),
}));

vi.mock("../../src/helpers/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/helpers/http")>();
  return {
    ...actual,
    fetchJSONPostWithLimit: (...args: unknown[]) => fetchJSONPostWithLimit(...args),
    fetchJSONGetWithLimit: (...args: unknown[]) => fetchJSONGetWithLimit(...args),
  };
});

vi.mock("../../src/helpers/RateLimiter", () => ({
  RateLimiter: class {
    limit = rateLimit;
  },
}));

import { getProxyWfsClient, resolveProxyTravelTime } from "../../src/proxy/transport";
import { resetEnv } from "../../src/config/env";

const TEST_SECRET = "a".repeat(64);

function makeRequest(overrides?: Partial<CompiledRequest>): CompiledRequest {
  return {
    url: "https://data.geopf.fr/wfs/ows",
    query: { service: "WFS", request: "GetFeature", srsName: "EPSG:4326" },
    body: "service=WFS&request=GetFeature",
    // A marker present ONLY in get_url (never in query) proves the transport rebuilds
    // the URL from request.query and ignores get_url — the reason K1's assignment was dead.
    get_url: "https://data.geopf.fr/wfs/ows?FROM_GET_URL_MARKER=1",
    ...overrides,
  } as CompiledRequest;
}

beforeEach(() => {
  process.env.PROXY_URL_SECRET = TEST_SECRET;
  process.env.GPF_WFS_PROXY_RATE_LIMIT = "10";
  process.env.GPF_NAVIGATION_PROXY_RATE_LIMIT = "5";
  process.env.PROXY_UPSTREAM_TIMEOUT = "10";
  process.env.PROXY_MAX_RESPONSE_BYTES = "26214400";
  resetEnv();
  fetchJSONPostWithLimit.mockReset();
  fetchJSONGetWithLimit.mockReset();
  rateLimit.mockClear();
});

afterAll(() => {
  delete process.env.PROXY_URL_SECRET;
  delete process.env.GPF_WFS_PROXY_RATE_LIMIT;
  delete process.env.GPF_NAVIGATION_PROXY_RATE_LIMIT;
  delete process.env.PROXY_UPSTREAM_TIMEOUT;
  delete process.env.PROXY_MAX_RESPONSE_BYTES;
  resetEnv();
});

describe("proxy/transport · buildProxyTransport (via getProxyWfsClient)", () => {
  it("rate-limits, builds the URL from request.query, and passes body + bounds + label to the bounded JSON fetch", async () => {
    const collection = { type: "FeatureCollection", features: [] };
    // fetchJSONPostWithLimit now parses internally, so it resolves the OBJECT.
    fetchJSONPostWithLimit.mockResolvedValue(collection);

    const request = makeRequest();
    const result = await getProxyWfsClient().fetchFeatureCollection(request);

    expect(result).toEqual(collection);
    expect(rateLimit).toHaveBeenCalledOnce();

    const [url, body, headers, timeoutMs, maxBytes, label] = fetchJSONPostWithLimit.mock.calls[0];
    // URL is rebuilt from request.query (NOT request.get_url), which is why the dead
    // get_url assignment was removed from execute.ts.
    expect(url).toContain("https://data.geopf.fr/wfs/ows?");
    expect(url).toContain("srsName=EPSG%3A4326");
    expect(url).not.toContain("FROM_GET_URL_MARKER"); // rebuilt from query, not copied from get_url
    expect(body).toBe(request.body);
    expect(headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
    expect(timeoutMs).toBe(10 * 1000); // PROXY_UPSTREAM_TIMEOUT (s) → ms
    expect(maxBytes).toBe(26214400); // PROXY_MAX_RESPONSE_BYTES
    expect(label).toBe("WFS"); // names the upstream leg in the 502 message
  });

  it("propagates a fetch error (non-2xx / byte cap / bad body) unchanged from the bounded fetch", async () => {
    // fetchJSONPostWithLimit already throws on non-2xx, the byte cap, and a 2xx
    // non-JSON body (→ 502, tested in helpers/http.test.ts); the transport must not
    // swallow it.
    const boom = new Error("HTTP 503 from upstream");
    fetchJSONPostWithLimit.mockRejectedValue(boom);

    await expect(getProxyWfsClient().fetchFeatureCollection(makeRequest())).rejects.toBe(boom);
  });
});

describe("proxy/transport · resolveProxyTravelTime", () => {
  const travelTimeInput: GpfGetFeaturesInput = {
    typename: "BDTOPO_V3:batiment",
    limit: 100,
    spatial_extras: [],
    travel_time_filter: { lon: 2.35, lat: 48.85, minutes: 15, profile: "pedestrian" },
  };

  it("resolves the isochrone through the BOUNDED fetch (PROXY_UPSTREAM_TIMEOUT + PROXY_MAX_RESPONSE_BYTES) and returns EWKT", async () => {
    // The real NavigationIsochroneClient runs; only its fetcher is mocked. This is
    // the regression guard: the travel_time leg must NOT use the unbounded
    // fetchJSONGet (HTTP_TIMEOUT only) — it must go through fetchJSONGetWithLimit
    // with the SAME bounds as the WFS leg, so a 2-call travel_time stays capped.
    fetchJSONGetWithLimit.mockResolvedValue({
      geometry: { type: "Polygon", coordinates: [[[2, 48], [2.2, 48], [2.2, 48.2], [2, 48]]] },
    });

    const result = await resolveProxyTravelTime(travelTimeInput);

    expect(fetchJSONGetWithLimit).toHaveBeenCalledOnce();
    const [url, timeoutMs, maxBytes, label] = fetchJSONGetWithLimit.mock.calls[0];
    // The isochrone URL carries the filter params.
    expect(url).toContain("data.geopf.fr/navigation/isochrone");
    expect(url).toContain("point=2.35%2C48.85"); // lon,lat url-encoded
    expect(url).toContain("costValue=15"); // minutes
    expect(url).toContain("profile=pedestrian");
    // Same bounds as the WFS leg — the whole point of the fix.
    expect(timeoutMs).toBe(10 * 1000); // PROXY_UPSTREAM_TIMEOUT (s) → ms, NOT HTTP_TIMEOUT
    expect(maxBytes).toBe(26214400); // PROXY_MAX_RESPONSE_BYTES
    expect(label).toBe("d'isochrone"); // names the isochrone leg in the 502 message
    // The dedicated GPF_NAVIGATION_PROXY rate limiter is invoked.
    expect(rateLimit).toHaveBeenCalled();
    expect(result.geometry_ewkt).toMatch(/^SRID=4326;POLYGON/);
  });

  it("throws defensively if called without a travel_time filter", async () => {
    const noFilter: GpfGetFeaturesInput = {
      typename: "BDTOPO_V3:batiment",
      limit: 100,
      spatial_extras: [],
    };
    await expect(resolveProxyTravelTime(noFilter)).rejects.toThrow(/travel_time/);
    expect(fetchJSONGetWithLimit).not.toHaveBeenCalled();
  });
});
