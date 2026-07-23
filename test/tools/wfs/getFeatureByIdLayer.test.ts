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

// The tool now runs a network-free catalog pre-flight: getFeatureType on the
// target typename. Mock the catalog so validation is deterministic.
vi.doMock("../../../src/wfs/catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsSchemaStore: {
    getFeatureType: mockGetFeatureType,
  },
}));

const { default: GpfGetFeatureByIdLayerTool } = await import(
  "../../../src/tools/GpfGetFeatureByIdLayerTool"
);

const communeType: OgcCollectionSchema = {
  id: "ADMINEXPRESS-COG.LATEST:commune",
  namespace: "ADMINEXPRESS-COG.LATEST",
  name: "commune",
  title: "Commune",
  description: "Fixture de test",
  properties: [
    { name: "code_insee", type: "string" },
    { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
  ],
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

describe("Test GpfGetFeatureByIdLayerTool", () => {
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
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.1" },
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
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.1" },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://proxy.example.test/api/v1/proxy/");
  });

  it("builds an opaque data_url that round-trips to the by-id-tagged params", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.8952",
          select: ["code_insee"],
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

    // Opaque token must decode to exactly { kind:by_id, typename, feature_id } —
    // the by-id discriminant plus the strict object shape the proxy re-validates.
    const decoded = decodeToken(token as string, SECRET);
    expect(decoded).toEqual({
      kind: PROXY_TOKEN_KIND.byId,
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.8952",
      select: ["code_insee"],
    });
    expect(mockGetFeatureType).toHaveBeenCalledWith("ADMINEXPRESS-COG.LATEST:commune");
  });

  it("does not build a double slash when the base URL has a trailing slash", async () => {
    mockGetEnv.mockReturnValue(makeEnv({ PROXY_PUBLIC_BASE_URL: "https://proxy.example.test/" }));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.1" },
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
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.1" },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://example.test/published/proxy/api/v1/proxy/");
  });

  it("rejects an unknown typename BEFORE minting the URL (catalog pre-flight)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    // The embedded catalog does not know this type -> getFeatureType throws.
    mockGetFeatureType.mockRejectedValue(new Error("FeatureTypeNotFound: TYPE_QUI_N_EXISTE_PAS"));
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: { typename: "TYPE_QUI_N_EXISTE_PAS", feature_id: "x.1" },
      },
    });

    // Unknown type fails at the tool call, not as an opaque proxy 5xx at load.
    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).not.toContain("data_url");
    expect(mockGetFeatureType).toHaveBeenCalledWith("TYPE_QUI_N_EXISTE_PAS");
  });

  it("rejects filters as unknown parameters (strict by-id surface)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          where: [{ property: "code_insee", operator: "eq", value: "01001" }],
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({ name: "where", code: "unknown_parameter" }),
      ]),
    });
  });

  it("rejects an unknown selected property BEFORE minting the URL", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          select: ["propriete_inconnue"],
        },
      },
    });

    expect(response.isError).toBe(true);
    expect((response.content[0] as { text: string }).text).toContain("n'existe pas");
    expect((response.content[0] as { text: string }).text).not.toContain("data_url");
    expect(mockGetFeatureType).toHaveBeenCalledWith("ADMINEXPRESS-COG.LATEST:commune");
  });

  it("rejects the geometry property in select because it is added automatically", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    mockGetFeatureType.mockResolvedValue(communeType);
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          select: ["geometrie"],
        },
      },
    });

    expect(response.isError).toBe(true);
    expect((response.content[0] as { text: string }).text).toContain("non géométriques");
    expect((response.content[0] as { text: string }).text).not.toContain("data_url");
  });

  it("rejects a missing feature_id", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfGetFeatureByIdLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id_layer",
        arguments: { typename: "ADMINEXPRESS-COG.LATEST:commune" },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({ name: "feature_id" }),
      ]),
    });
  });
});
