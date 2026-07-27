import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encodeToken } from "../../../src/proxy/token.js";
import { PROXY_TOKEN_KIND } from "../../../src/wfs/schema.js";
import { startProxyServer, type ProxyServerHandle } from "../helpers/proxy-server.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

/**
 * Level-1 integration test for the stateless geodata proxy: boots the server in HTTP
 * mode and exercises the real endpoint against the live Géoplateforme WFS.
 * Validates the end-to-end path (token decode → WFS query → full-geometry GeoJSON)
 * that unit tests (mocked) cannot cover.
 */
describe("proxy (level 1)", () => {
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
          kind: PROXY_TOKEN_KIND.query,
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          where: [{ property: "code_insee", operator: "eq", value: "75056" }],
          limit: 5,
        },
        server.key,
      );

      const res = await fetch(`${server.baseUrl}${server.endpoint}/${token}.json`);
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

  it(
    "returns a single full-geometry feature for a by-id token",
    async () => {
      // First resolve a real feature_id via a query token (WFS ids are opaque
      // `commune.<n>` values we cannot hardcode reliably), then round-trip it
      // through the by-id path.
      const queryToken = encodeToken(
        {
          kind: PROXY_TOKEN_KIND.query,
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          where: [{ property: "code_insee", operator: "eq", value: "75056" }],
          limit: 1,
        },
        server.key,
      );
      const queryRes = await fetch(`${server.baseUrl}${server.endpoint}/${queryToken}.json`);
      expect(queryRes.status).toBe(200);
      const queryBody = (await queryRes.json()) as { features?: { id?: string }[] };
      const featureId = queryBody.features?.[0]?.id;
      expect(featureId).toBeTruthy();

      const token = encodeToken(
        {
          kind: PROXY_TOKEN_KIND.byId,
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: featureId as string,
          select: ["code_insee"],
        },
        server.key,
      );

      const res = await fetch(`${server.baseUrl}${server.endpoint}/${token}.json`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/geo+json");

      const body = (await res.json()) as {
        type?: string;
        features?: { geometry?: { type?: string }; properties?: Record<string, unknown> }[];
      };
      expect(body.type).toBe("FeatureCollection");
      expect(body.features!.length).toBe(1);
      expect(body.features![0].geometry).toBeTruthy();
      expect(body.features![0].properties).toHaveProperty("code_insee");
    },
    INTEGRATION_CONFIG.timeout,
  );

  it("rejects a tampered token with 400", async () => {
    const res = await fetch(`${server.baseUrl}${server.endpoint}/not-a-real-token.json`);
    expect(res.status).toBe(400);
  });
});
