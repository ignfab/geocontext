import { vi, describe, it, expect, afterEach } from "vitest";

import type { Env } from "../../src/config/env.js";
import { decodeToken } from "../../src/proxy/token.js";
import { PROXY_TOKEN_KIND, gpfIsolineLayerInputSchema } from "../../src/wfs/schema.js";
import { validateStructuredContentAgainstOutputSchema } from "./helpers/outputSchema";

const SECRET_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SECRET = Buffer.from(SECRET_HEX, "hex");

const mockGetEnv = vi.fn<() => Env>();

vi.doMock("../../src/config/env.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/config/env.js")>(
    "../../src/config/env.js",
  );
  mockGetEnv.mockImplementation(actual.getEnv);
  return {
    ...actual,
    getEnv: mockGetEnv,
  };
});

const { default: GpfIsolineLayerTool } = await import(
  "../../src/tools/GpfIsolineLayerTool"
);

function makeEnv(overrides: Partial<Env>): Env {
  return {
    TRANSPORT_TYPE: "http",
    PROXY_URL_SECRET: SECRET,
    PROXY_PUBLIC_BASE_URL: "https://proxy.example.test",
    PROXY_ENDPOINT: "/api/v1/proxy",
    ...overrides,
  } as Env;
}

describe("Test GpfIsolineLayerTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockGetEnv.mockReset();
  });

  it("fails fast when no proxy is configured", async () => {
    mockGetEnv.mockReturnValue(
      makeEnv({ PROXY_URL_SECRET: undefined, PROXY_PUBLIC_BASE_URL: undefined }),
    );
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          lon: 2.337306,
          lat: 48.849319,
          profile: "pedestrian",
          cost_value: 15,
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("PROXY_URL_SECRET");
  });

  it("mints a data_url with the default cost_type", async () => {
    mockGetEnv.mockReturnValue(makeEnv({ TRANSPORT_TYPE: "stdio" }));
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          lon: 2.337306,
          lat: 48.849319,
          profile: "pedestrian",
          cost_value: 15,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://proxy.example.test/api/v1/proxy/");
  });

  it("builds an opaque data_url that round-trips to the tagged isoline params", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          lon: 2.337306,
          lat: 48.849319,
          profile: "car",
          cost_type: "distance",
          cost_value: 50_000,
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
    expect(
      validateStructuredContentAgainstOutputSchema(
        tool.toolDefinition.outputSchema,
        response.structuredContent,
      ),
    ).toBeNull();

    const url = new URL(payload.data_url);
    const token = url.pathname.slice("/api/v1/proxy/".length, -".json".length);
    const decoded = decodeToken(token, SECRET);
    expect(decoded).toEqual({
      kind: PROXY_TOKEN_KIND.isoline,
      lon: 2.337306,
      lat: 48.849319,
      profile: "car",
      cost_type: "distance",
      cost_value: 50_000,
    });
  });

  it("rejects a cost above the supported maximum", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfIsolineLayerTool();

    for (const { type, cost } of [
      { type: "time", cost: 601 },
      { type: "distance", cost: 50_001 },
    ]) {
      const response = await tool.toolCall({
        params: {
          name: "gpf_isoline_layer",
          arguments: {
            lon: 2.337306,
            lat: 48.849319,
            profile: "pedestrian",
            cost_type: type,
            cost_value: cost,
          },
        },
      });

      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({
        type: "urn:geocontext:problem:invalid-tool-params",
        errors: expect.arrayContaining([
          expect.objectContaining({ name: "cost_value" }),
        ]),
      });
    }
  });

  it("emits a `too_big` cost_value issue for an out-of-range distance", () => {
    const result = gpfIsolineLayerInputSchema.safeParse({
      lon: 2.337306,
      lat: 48.849319,
      profile: "pedestrian",
      cost_type: "distance",
      cost_value: 50_001,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected parse failure");
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "too_big",
          path: ["cost_value"],
          message: expect.stringContaining("ne peut pas dépasser"),
        }),
      ]),
    );
  });
});
