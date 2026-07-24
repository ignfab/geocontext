import { vi, describe, it, expect, afterEach } from "vitest";

import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";

import type { Env } from "../../../src/config/env.js";
import { decodeToken } from "../../../src/proxy/token.js";
import { PROXY_TOKEN_KIND } from "../../../src/wfs/schema.js";

// 32-byte key as 64 hex chars, decoded to a Buffer the way env.ts would.
const SECRET_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SECRET = Buffer.from(SECRET_HEX, "hex");

const mockGetEnv = vi.fn<() => Env>();
const mockGetFeatureType = vi.fn<(typename: string) => Promise<OgcCollectionSchema>>();

vi.doMock("../../../src/config/env.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/config/env.js")>(
    "../../../src/config/env.js",
  );
  // Default to the real env so modules that read it at import time (e.g. logger)
  // load cleanly; individual tests override the return value.
  mockGetEnv.mockImplementation(actual.getEnv);
  return {
    ...actual,
    getEnv: mockGetEnv,
  };
});

// The tool now runs a network-free catalog pre-flight: getFeatureType +
// compileQueryParts against the EMBEDDED catalog. Mock the catalog so the
// validation is deterministic and does not depend on the shipped catalog.
vi.doMock("../../../src/wfs/catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsSchemaStore: {
    getFeatureType: mockGetFeatureType,
  },
}));

const { default: GpfGetFeaturesLayerTool } = await import(
  "../../../src/tools/GpfGetFeaturesLayerTool"
);

const communeType: OgcCollectionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  "x-collection-id": "ADMINEXPRESS-COG.LATEST:commune",
  type: "object",
  title: "Commune",
  description: "Fixture de test",
  properties: {
    code_insee: { type: "string" },
    nom_officiel: { type: "string" },
    population: { type: "integer" },
    geometrie: { },
  },
  required: [],
};

/**
 * Builds a full env object; only the fields the tool reads matter, the rest are
 * filled with harmless defaults so the shape stays assignable to `Env`.
 */
function makeEnv(overrides: Partial<Env>): Env {
  return {
    TRANSPORT_TYPE: "http",
    PROXY_URL_SECRET: SECRET,
    PROXY_PUBLIC_BASE_URL: "https://proxy.example.test",
    PROXY_ENDPOINT: "/api/v1/proxy",
    ...overrides,
  } as Env;
}

describe("Test GpfGetFeaturesLayerTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockGetEnv.mockReset();
    mockGetFeatureType.mockReset();
  });

  it("fails fast when no proxy is configured, without touching the catalog", async () => {
    // No secret + no public base URL = no reachable proxy to serve the layer. The
    // gate is on configuration, not transport, so the transport here is irrelevant.
    mockGetEnv.mockReturnValue(
      makeEnv({ PROXY_URL_SECRET: undefined, PROXY_PUBLIC_BASE_URL: undefined }),
    );
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune" },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("PROXY_URL_SECRET");
    // Fail-fast means the catalog pre-flight never runs.
    expect(mockGetFeatureType).not.toHaveBeenCalled();
  });

  it("mints a data_url under stdio when a proxy IS configured (gate is config, not transport)", async () => {
    // stdio + a locally-run proxy (secret + base URL set) is a valid dev setup: the
    // tool must produce a URL, proving the gate no longer keys on TRANSPORT_TYPE.
    mockGetEnv.mockReturnValue(makeEnv({ TRANSPORT_TYPE: "stdio" }));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune" },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://proxy.example.test/api/v1/proxy/");
  });

  it("builds an opaque data_url that round-trips back to the tagged query params", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          where: [{ property: "code_insee", operator: "eq", value: "01001" }],
          limit: 50,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload).toEqual(response.structuredContent);

    const url = new URL(payload.data_url);
    expect(url.pathname.startsWith("/api/v1/proxy/")).toBe(true);
    expect(url.pathname.endsWith(".json")).toBe(true);
    const token = url.pathname.slice("/api/v1/proxy/".length, -".json".length);
    expect(token).toBeTruthy();

    // The token is opaque but must decode back to exactly the encoded params: the
    // query discriminant plus the strict object shape the proxy re-validates — no
    // spatial_extras.
    const decoded = decodeToken(token as string, SECRET);
    expect(decoded).toEqual({
      kind: PROXY_TOKEN_KIND.query,
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      where: [{ property: "code_insee", operator: "eq", value: "01001" }],
      limit: 50,
    });
  });

  it("does not build a double slash when the base URL has a trailing slash", async () => {
    mockGetEnv.mockReturnValue(makeEnv({ PROXY_PUBLIC_BASE_URL: "https://proxy.example.test/" }));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune" },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://proxy.example.test/api/v1/proxy/");
    expect(payload.data_url).not.toContain("//api/v1");
  });

  it("preserves an ingress path prefix on the public base URL", async () => {
    mockGetEnv.mockReturnValue(makeEnv({ PROXY_PUBLIC_BASE_URL: "https://example.test/published/proxy" }));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune" },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://example.test/published/proxy/api/v1/proxy/");
  });

  it("rejects spatial_extras as an unknown parameter", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          spatial_extras: ["bbox"],
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({ name: "spatial_extras", code: "unknown_parameter" }),
      ]),
    });
    // Zod validation fails before the catalog pre-flight.
    expect(mockGetFeatureType).not.toHaveBeenCalled();
  });

  it("rejects multiple spatial filters via the cross-field refinement", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          bbox_filter: { west: 2.1, south: 48.7, east: 2.5, north: 48.9 },
          intersects_point_filter: { lon: 2.35, lat: 48.85 },
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
    });
  });

  it("rejects an unknown property BEFORE minting the URL (catalog pre-flight)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          select: ["definitely_not_a_property"],
        },
      },
    });

    // The bad property must fail at the tool call, not surface later as an opaque
    // proxy 5xx when the map client fetches the data_url.
    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    // No data_url was minted.
    expect(textContent.text).not.toContain("data_url");
    expect(mockGetFeatureType).toHaveBeenCalledWith("ADMINEXPRESS-COG.LATEST:commune");
  });

  it("rejects an unknown intersects_feature reference typename BEFORE minting (catalog pre-flight)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    // The target type is known; the reference type in the spatial filter is not.
    mockGetFeatureType.mockImplementation(async (typename: string) => {
      if (typename === "ADMINEXPRESS-COG.LATEST:commune") return communeType;
      throw new Error(`FeatureTypeNotFound: ${typename}`);
    });
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          intersects_feature_filter: {
            typename: "TYPE_QUI_N_EXISTE_PAS",
            feature_id: "x.1",
          },
        },
      },
    });

    // The bogus reference typename must fail at the tool call, not as a proxy 5xx.
    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).not.toContain("data_url");
    expect(mockGetFeatureType).toHaveBeenCalledWith("TYPE_QUI_N_EXISTE_PAS");
  });

  it("rejects an intersects_feature reference type that has NO geometry column BEFORE minting (catalog pre-flight)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    // Reference type EXISTS but is an attribute-only table (no property is geometric),
    // so the proxy could not resolve a reference geometry from it. The
    // pre-flight must catch that here (getGeometryName), not defer it to an opaque
    // proxy 5xx at map-load — symmetric with the main typename's geometry check.
    const tableType: OgcCollectionSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      "x-collection-id": "wfs_scot:doc_urba",
      type: "object",
      title: "Document d'urbanisme (table, sans géométrie)",
      description: "Fixture de test : type attributaire sans géométrie",
      properties: {
        partition: { type: "string" },
        idurba: { type: "string" },
      },
      required: [],
    };
    mockGetFeatureType.mockImplementation(async (typename: string) => {
      if (typename === "ADMINEXPRESS-COG.LATEST:commune") return communeType;
      if (typename === "wfs_scot:doc_urba") return tableType;
      throw new Error(`FeatureTypeNotFound: ${typename}`);
    });
    const tool = new GpfGetFeaturesLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          intersects_feature_filter: {
            typename: "wfs_scot:doc_urba",
            feature_id: "doc_urba.1",
          },
        },
      },
    });

    // Fails at the tool call (no data_url minted); the reference typename WAS loaded.
    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).not.toContain("data_url");
    expect(mockGetFeatureType).toHaveBeenCalledWith("wfs_scot:doc_urba");
  });

  it("translates an oversized query into a FR proxy-url error", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeaturesLayerTool();

    // Many where clauses on a VALID catalog property (so the catalog pre-flight passes)
    // but with unique, incompressible values, so the encoded token blows past
    // MAX_TOKEN_CHARS and encodeToken throws ProxyTokenTooLargeError.
    const where = Array.from({ length: 400 }, (_unused, index) => ({
      property: "code_insee",
      operator: "eq" as const,
      value: `val_${index}_${(index * 104729).toString(36)}_${(index * 1299709).toString(36)}`,
    }));

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_features_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune", where },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    // FR message, not the EN codec message.
    expect(textContent.text).toContain("trop volumineuse");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:proxy-url-error",
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "proxy_url_too_large" }),
      ]),
    });
  });
});
