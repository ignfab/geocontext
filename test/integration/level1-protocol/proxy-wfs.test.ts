import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encodeToken } from "../../../src/proxy/token.js";
import { startProxyServer, type ProxyServerHandle } from "../helpers/proxy-server.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

/**
 * Level-1 integration test for the stateless WFS proxy: boots the server in HTTP
 * mode and exercises the real endpoint against the live Géoplateforme WFS.
 * Validates the end-to-end path (token decode → WFS query → full-geometry GeoJSON)
 * that unit tests (mocked) cannot cover.
 */
describe("proxy-wfs (level 1)", () => {
  let server: ProxyServerHandle;

  beforeAll(async () => {
    server = await startProxyServer();
  }, INTEGRATION_CONFIG.connectTimeout);

  afterAll(async () => {
    await server?.cleanup();
  });

  it(
    "returns a full-geometry GeoJSON FeatureCollection for a valid token",
    async () => {
      const token = encodeToken(
        {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          where: [{ property: "code_insee", operator: "eq", value: "75056" }],
          limit: 5,
        },
        server.key,
      );

      const res = await fetch(`${server.baseUrl}${server.endpoint}?q=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/geo+json");

      const body = (await res.json()) as {
        type?: string;
        features?: { geometry?: { type?: string } }[];
      };
      expect(body.type).toBe("FeatureCollection");
      expect(Array.isArray(body.features)).toBe(true);
      expect(body.features!.length).toBeGreaterThan(0);
      // Geometry must be present (the proxy returns full geometry, unlike the LLM path).
      expect(body.features![0].geometry).toBeTruthy();
      expect(body.features![0].geometry!.type).toMatch(/Polygon/);
    },
    INTEGRATION_CONFIG.timeout,
  );

  it("rejects a tampered token with 400", async () => {
    const res = await fetch(`${server.baseUrl}${server.endpoint}?q=not-a-real-token`);
    expect(res.status).toBe(400);
  });
});
