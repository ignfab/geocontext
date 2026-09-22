import { vi, describe, it, expect, afterEach } from "vitest";

import type { Env } from "../../src/config/env.js";
import { decodeToken } from "../../src/proxy/token.js";
import { PROXY_TOKEN_KIND } from "../../src/wfs/schema.js";
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

const { default: GpfItineraryLayerTool } = await import(
  "../../src/tools/GpfItineraryLayerTool"
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

describe("Test GpfItineraryLayerTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockGetEnv.mockReset();
  });

  it("fails fast when no proxy is configured", async () => {
    mockGetEnv.mockReturnValue(
      makeEnv({ PROXY_URL_SECRET: undefined, PROXY_PUBLIC_BASE_URL: undefined }),
    );
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure_lon: 2.337306,
          departure_lat: 48.849319,
          arrival_lon: 2.352,
          arrival_lat: 48.866,
          profile: "pedestrian",
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

  it("mints a data_url", async () => {
    mockGetEnv.mockReturnValue(makeEnv({ TRANSPORT_TYPE: "stdio" }));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure_lon: 2.337306,
          departure_lat: 48.849319,
          arrival_lon: 2.352,
          arrival_lat: 48.866,
          profile: "pedestrian",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    expect(payload.data_url).toContain("https://proxy.example.test/api/v1/proxy/");
  });

  it("builds an opaque data_url that round-trips to the tagged itinerary params", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure_lon: 2.337306,
          departure_lat: 48.849319,
          arrival_lon: 2.352,
          arrival_lat: 48.866,
          profile: "car",
          optimize: "distance",
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
      kind: PROXY_TOKEN_KIND.itinerary,
      departure_lon: 2.337306,
      departure_lat: 48.849319,
      arrival_lon: 2.352,
      arrival_lat: 48.866,
      profile: "car",
      optimize: "distance",
    });
  });

  it("round-trips without optimize (defaults omitted from token)", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure_lon: 2.337306,
          departure_lat: 48.849319,
          arrival_lon: 2.352,
          arrival_lat: 48.866,
          profile: "pedestrian",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = JSON.parse((response.content[0] as { text: string }).text);
    const url = new URL(payload.data_url);
    const token = url.pathname.slice("/api/v1/proxy/".length, -".json".length);
    const decoded = decodeToken(token, SECRET);
    expect(decoded).toMatchObject({
      kind: PROXY_TOKEN_KIND.itinerary,
      departure_lon: 2.337306,
      departure_lat: 48.849319,
      arrival_lon: 2.352,
      arrival_lat: 48.866,
      profile: "pedestrian",
    });
    expect((decoded as Record<string, unknown>).optimize).toBeUndefined();
  });

  it("rejects an invalid profile", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure_lon: 2.337306,
          departure_lat: 48.849319,
          arrival_lon: 2.352,
          arrival_lat: 48.866,
          profile: "bike",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({ name: "profile" }),
      ]),
    });
  });
  it("rejects a departure/arrival pair beyond the crow-flies cap", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          // Saint-Quentin -> Dijon: ~300 km apart, well over the 100 km cap.
          departure_lon: 3.274356,
          departure_lat: 49.839862,
          arrival_lon: 5.044572,
          arrival_lat: 47.326213,
          profile: "car",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({ detail: expect.stringContaining("vol d'oiseau") }),
      ]),
    });
  });

  it("accepts a pair just under the crow-flies cap", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          // Saint-Quentin -> Laon: ~40 km apart.
          departure_lon: 3.274356,
          departure_lat: 49.839862,
          arrival_lon: 3.623693,
          arrival_lat: 49.564267,
          profile: "car",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const { data_url: dataUrl } = response.structuredContent as { data_url: string };
    const token = new URL(dataUrl).pathname.slice("/api/v1/proxy/".length, -".json".length);
    expect(decodeToken(token, SECRET)).toMatchObject({
      kind: PROXY_TOKEN_KIND.itinerary,
      arrival_lon: 3.623693,
      arrival_lat: 49.564267,
    });
  });
});
