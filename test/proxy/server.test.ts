import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";

import { encodeToken } from "../../src/proxy/token";
import { resetEnv } from "../../src/config/env";
import { PROXY_TOKEN_KIND } from "../../src/wfs/schema";
import { FeatureNotFoundError, FeatureCardinalityError } from "../../src/wfs/byId";
import { ServiceResponseError, ResponseTooLargeError } from "../../src/helpers/http";

// Mock the proxy engine + transport so the server is exercised WITHOUT network.
const runGeometryFeatureQuery = vi.fn();
const runGeometryFeatureByIdQuery = vi.fn();
vi.mock("../../src/proxy/execute", () => ({
  runGeometryFeatureQuery: (...args: unknown[]) => runGeometryFeatureQuery(...args),
  runGeometryFeatureByIdQuery: (...args: unknown[]) => runGeometryFeatureByIdQuery(...args),
}));
vi.mock("../../src/proxy/transport", () => ({
  getProxyWfsClient: () => ({}),
  resolveProxyTravelTime: vi.fn(),
}));

// A fixed 32-byte hex key for the test environment.
const TEST_SECRET = "a".repeat(64);
const KEY = Buffer.from(TEST_SECRET, "hex");
const ENDPOINT = "/api/v1/proxy-wfs";

let server: Server;
let baseUrl: string;
let startProxyServer: typeof import("../../src/proxy/server").startProxyServer;

const SAMPLE_COLLECTION = {
  type: "FeatureCollection",
  features: [{ type: "Feature", id: "commune.1", geometry: { type: "Point", coordinates: [2, 48] }, properties: {} }],
};

function validToken() {
  return encodeToken({ kind: PROXY_TOKEN_KIND.query, typename: "BDTOPO_V3:batiment", limit: 100 }, KEY);
}

function validByIdToken() {
  return encodeToken({
    kind: PROXY_TOKEN_KIND.byId,
    typename: "BDTOPO_V3:batiment",
    feature_id: "batiment.1",
    select: ["hauteur"],
  }, KEY);
}

beforeAll(async () => {
  process.env.TRANSPORT_TYPE = "http";
  process.env.PROXY_URL_SECRET = TEST_SECRET;
  // A fixed, uncommon test port (env validation forbids 0). The listener then
  // reports its actual address, which the requests target.
  process.env.PROXY_PORT = "34567";
  process.env.HTTP_HOST = "127.0.0.1";
  resetEnv();
  ({ startProxyServer } = await import("../../src/proxy/server"));
  server = await startProxyServer();
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env.TRANSPORT_TYPE;
  delete process.env.PROXY_URL_SECRET;
  delete process.env.PROXY_PORT;
  resetEnv();
});

beforeEach(() => {
  runGeometryFeatureQuery.mockReset();
  runGeometryFeatureByIdQuery.mockReset();
});

describe("proxy/server", () => {
  it("returns the GeoJSON FeatureCollection as application/geo+json on a valid token", async () => {
    runGeometryFeatureQuery.mockResolvedValue(SAMPLE_COLLECTION);

    const res = await request(baseUrl).get(ENDPOINT).query({ q: validToken() });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/geo+json");
    expect(JSON.parse(res.text)).toEqual(SAMPLE_COLLECTION);
    expect(runGeometryFeatureQuery).toHaveBeenCalledOnce();
  });

  it("502 on an upstream ServiceResponseError (e.g. non-JSON 2xx body)", async () => {
    // The transport raises a ServiceResponseError for a bad upstream body; the
    // server must surface it as a gateway error (502), not a generic 500.
    runGeometryFeatureQuery.mockRejectedValue(
      new ServiceResponseError("bad upstream body", {
        http: { status: 502, statusText: "Bad Gateway" },
        service: { code: "InvalidParameterValue", detail: "Illegal property name: LEAK_ME" },
      }),
    );
    const res = await request(baseUrl).get(ENDPOINT).query({ q: validToken() });
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: true });
    // Must NOT forward the raw upstream serviceDetail/message to the client.
    expect(res.text).not.toContain("LEAK_ME");
    expect(res.text).not.toContain("bad upstream body");
  });

  it("504 on an upstream timeout ServiceResponseError", async () => {
    // httpStatus 504 must take the 504 arm of the mapping, not collapse to 502/500.
    runGeometryFeatureQuery.mockRejectedValue(
      new ServiceResponseError("upstream timed out", {
        http: { status: 504, statusText: "Gateway Timeout" },
      }),
    );
    const res = await request(baseUrl).get(ENDPOINT).query({ q: validToken() });
    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ error: true });
    expect(res.text).not.toContain("upstream timed out");
  });

  it("500 on an unexpected (non-typed) error", async () => {
    runGeometryFeatureQuery.mockRejectedValue(new Error("boom"));
    const res = await request(baseUrl).get(ENDPOINT).query({ q: validToken() });
    expect(res.status).toBe(500);
  });

  it("413 on an over-long `q` (token exceeds MAX_TOKEN_CHARS)", async () => {
    // decodeToken rejects a raw token longer than MAX_TOKEN_CHARS (4000) up front,
    // before any decrypt — so a long junk string is enough to hit ProxyTokenTooLargeError.
    const res = await request(baseUrl).get(ENDPOINT).query({ q: "a".repeat(4001) });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ error: true });
    expect(runGeometryFeatureQuery).not.toHaveBeenCalled();
  });

  it("413 on an oversize upstream response (ResponseTooLargeError)", async () => {
    runGeometryFeatureQuery.mockRejectedValue(new ResponseTooLargeError("response exceeds 25 MiB"));
    const res = await request(baseUrl).get(ENDPOINT).query({ q: validToken() });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ error: true });
  });

  it("400 when `q` is missing", async () => {
    const res = await request(baseUrl).get(ENDPOINT);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: true });
    expect(runGeometryFeatureQuery).not.toHaveBeenCalled();
  });

  it("400 on a malformed/tampered token", async () => {
    const res = await request(baseUrl).get(ENDPOINT).query({ q: "not-a-real-token!!" });
    expect(res.status).toBe(400);
    expect(runGeometryFeatureQuery).not.toHaveBeenCalled();
  });

  it("400 when the decoded params fail schema validation", async () => {
    // Encodes a query-kind payload the layer schema rejects (empty typename).
    const badToken = encodeToken({ kind: PROXY_TOKEN_KIND.query, typename: "", limit: 100 }, KEY);
    const res = await request(baseUrl).get(ENDPOINT).query({ q: badToken });
    expect(res.status).toBe(400);
  });

  it("400 when the token carries no `kind` discriminant", async () => {
    // A token minted without a kind must be rejected as malformed, never
    // silently dispatched to a query path.
    const untagged = encodeToken({ typename: "BDTOPO_V3:batiment", limit: 100 }, KEY);
    const res = await request(baseUrl).get(ENDPOINT).query({ q: untagged });
    expect(res.status).toBe(400);
    expect(runGeometryFeatureQuery).not.toHaveBeenCalled();
    expect(runGeometryFeatureByIdQuery).not.toHaveBeenCalled();
  });

  it("dispatches a by-id token to the single-feature engine", async () => {
    runGeometryFeatureByIdQuery.mockResolvedValue(SAMPLE_COLLECTION);

    const res = await request(baseUrl).get(ENDPOINT).query({ q: validByIdToken() });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/geo+json");
    expect(JSON.parse(res.text)).toEqual(SAMPLE_COLLECTION);
    expect(runGeometryFeatureByIdQuery).toHaveBeenCalledOnce();
    expect(runGeometryFeatureQuery).not.toHaveBeenCalled();
    // The `kind` discriminant is stripped before the engine call — it receives the
    // strict { typename, feature_id, select? } payload only.
    const [input] = runGeometryFeatureByIdQuery.mock.calls[0];
    expect(input).toEqual({
      typename: "BDTOPO_V3:batiment",
      feature_id: "batiment.1",
      select: ["hauteur"],
    });
  });

  it("404 when the by-id feature is absent (FeatureNotFoundError)", async () => {
    runGeometryFeatureByIdQuery.mockRejectedValue(
      new FeatureNotFoundError("Le feature 'batiment.404' est introuvable dans 'BDTOPO_V3:batiment'."),
    );

    const res = await request(baseUrl).get(ENDPOINT).query({ q: validByIdToken() });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", true);
    expect(res.body.type).toBeUndefined(); // not a GeoJSON-shaped body
  });

  it("502 when the by-id result breaks cardinality (FeatureCardinalityError)", async () => {
    runGeometryFeatureByIdQuery.mockRejectedValue(
      new FeatureCardinalityError("… devrait être unique, mais 2 objets ont été retournés."),
    );

    const res = await request(baseUrl).get(ENDPOINT).query({ q: validByIdToken() });

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty("error", true);
  });

  it("404 on an unknown path", async () => {
    const res = await request(baseUrl).get("/nope").query({ q: validToken() });
    expect(res.status).toBe(404);
  });

  it("405 on a non-GET method", async () => {
    const res = await request(baseUrl).post(ENDPOINT).query({ q: validToken() });
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toContain("GET");
  });

  it("does not return a GeoJSON-shaped body on error", async () => {
    const res = await request(baseUrl).get(ENDPOINT); // missing q -> 400
    expect(res.body.type).toBeUndefined(); // not a FeatureCollection
    expect(res.body).toHaveProperty("error", true);
  });

  it("opens CORS to any origin (public stateless data, Allow-Origin: *)", async () => {
    runGeometryFeatureQuery.mockResolvedValue(SAMPLE_COLLECTION);
    const res = await request(baseUrl)
      .get(ENDPOINT)
      .query({ q: validToken() })
      .set("Origin", "https://any.example");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("returns Allow-Origin: * even without an Origin header (non-browser client)", async () => {
    runGeometryFeatureQuery.mockResolvedValue(SAMPLE_COLLECTION);
    const res = await request(baseUrl).get(ENDPOINT).query({ q: validToken() });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("answers OPTIONS preflight with 204 and the CORS method headers", async () => {
    const res = await request(baseUrl).options(ENDPOINT).set("Origin", "https://any.example");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
  });
});
