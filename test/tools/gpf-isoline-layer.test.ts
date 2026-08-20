import { vi, describe, it, expect, afterEach } from "vitest";

import type { Env } from "../../src/config/env.js";
import { decodeToken } from "../../src/proxy/token.js";
import { PROXY_TOKEN_KIND } from "../../src/wfs/schema.js";
import { NAVIGATION_ISOCHRONE_MAX_TIME_MINUTES } from "../../src/gpf/navigation.js";
import { validateStructuredContentAgainstOutputSchema } from "./helpers/outputSchema.js";

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
  "../../src/tools/GpfIsolineLayerTool.js"
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

  it("publishes the same minutes upper bound as runtime validation", () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfIsolineLayerTool();

    const minutesSchema = (tool.toolDefinition.inputSchema.properties as Record<string, unknown>)
      .minutes as { maximum?: number };

    expect(minutesSchema.maximum).toBe(NAVIGATION_ISOCHRONE_MAX_TIME_MINUTES);
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
          minutes: 15,
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

  it("mints a data_url under stdio when a proxy is configured (gate is config, not transport)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({ TRANSPORT_TYPE: "stdio" }));
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          lon: 2.337306,
          lat: 48.849319,
          profile: "pedestrian",
          minutes: 15,
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
          minutes: 60,
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
      minutes: 60,
    });
  });

  it("rejects a time cost above the supported maximum", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          lon: 2.337306,
          lat: 48.849319,
          profile: "pedestrian",
          minutes: NAVIGATION_ISOCHRONE_MAX_TIME_MINUTES + 1,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain(`minutes: La valeur doit être au plus ${NAVIGATION_ISOCHRONE_MAX_TIME_MINUTES}.`);
  });

  it("rejects an unknown key such as kind (strict isoline surface)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          kind: PROXY_TOKEN_KIND.query,
          lon: 2.337306,
          lat: 48.849319,
          profile: "pedestrian",
          minutes: 15,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect((response.content[0] as { text: string }).text).toContain("Le paramètre 'kind' n'est pas reconnu.");
  });

  it("rejects a missing profile", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfIsolineLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_isoline_layer",
        arguments: {
          lon: 2.337306,
          lat: 48.849319,
          minutes: 15,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect((response.content[0] as { text: string }).text).toContain("Le paramètre 'profile' est requis.");
  });
});
