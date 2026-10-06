import { vi, describe, it, expect, afterEach } from "vitest";

import type { Env } from "../../src/config/env.js";
import { decodeToken } from "../../src/proxy/token.js";
import { PROXY_TOKEN_KIND } from "../../src/wfs/schema.js";
import { validateStructuredContentAgainstOutputSchema } from "./helpers/outputSchema";
import { ITINERARY_PEDESTRIAN_MAX_DIRECT_DISTANCE_METERS } from "../../src/gpf/itinerary.js";
import { NAVIGATION_BBOX } from "../../src/gpf/navigation.js";

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
          departure: { lon: 2.337306, lat: 48.849319, },
          arrival: { lon: 2.352, lat: 48.866, },
          optimize: "time",
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

  it("builds an opaque data_url that round-trips to the tagged itinerary params", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure: { lon: 2.337306, lat: 48.849319, },
          arrival: { lon: 2.352, lat: 48.866, },
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
      departure: { lon: 2.337306, lat: 48.849319, },
      arrival: { lon: 2.352, lat: 48.866, },
      profile: "car",
      optimize: "distance",
    });
  });

  it("defaults optimize to time, like the `distance` tool", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure: { lon: 2.337306, lat: 48.849319 },
          arrival: { lon: 2.352, lat: 48.866 },
          profile: "car",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const { data_url: dataUrl } = response.structuredContent as { data_url: string };
    const token = new URL(dataUrl).pathname.slice("/api/v1/proxy/".length, -".json".length);
    expect(decodeToken(token, SECRET)).toMatchObject({ optimize: "time" });
    expect(tool.toolDefinition.inputSchema.required).not.toContain("optimize");
  });

  it("rejects an invalid profile", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          departure: { lon: 2.337306, lat: 48.849319, },
          arrival: { lon: 2.352, lat: 48.866, },
          optimize: "time",
          profile: "bike",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain(`profile`);
  });

  it("rejects a pedestrian departure/arrival pair beyond the crow-flies cap", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          // Saint-Quentin -> Dijon: ~300 km apart, over the pedestrian cap.
          departure: { lon: 3.274356, lat: 49.839862, },
          arrival: { lon: 5.044572, lat: 47.326213, },
          optimize: "time",
          profile: "pedestrian",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain(`309 km`);
    expect(textContent.text).toContain(`ne peut pas dépasser ${ITINERARY_PEDESTRIAN_MAX_DIRECT_DISTANCE_METERS / 1000} km`);
  });

  it("accepts a long car itinerary", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          // Brest -> Menton: ~1050 km apart.
          departure: { lon: -4.4861, lat: 48.3904, },
          arrival: { lon: 7.4975, lat: 43.7745, },
          profile: "car",
        },
      },
    });

    expect(response.isError).toBeUndefined();
  });

  it("rejects a point outside the navigation service extent", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          // Paris -> Berlin: Berlin lies north of the upstream bbox.
          departure: { lon: 2.3522, lat: 48.8566, },
          arrival: { lon: 13.405, lat: 52.52, },
          profile: "car",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("arrival.lat");
    expect(textContent.text).toContain(String(NAVIGATION_BBOX[3]));
  });

  it("publishes the navigation service extent as coordinate bounds", () => {
    const tool = new GpfItineraryLayerTool();
    const [west, south, east, north] = NAVIGATION_BBOX;

    expect(tool.toolDefinition.inputSchema.properties?.departure).toMatchObject({
      properties: {
        lon: { minimum: west, maximum: east },
        lat: { minimum: south, maximum: north },
      },
    });
  });

  it("accepts a pair under the crow-flies cap", async () => {
    mockGetEnv.mockReturnValue(makeEnv({}));
    const tool = new GpfItineraryLayerTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_itinerary_layer",
        arguments: {
          // Saint-Quentin -> Laon: ~40 km apart.
          departure: { lon: 3.274356, lat: 49.839862, },
          arrival: { lon: 3.623693, lat: 49.564267, },
          optimize: "distance",
          profile: "pedestrian",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const { data_url: dataUrl } = response.structuredContent as { data_url: string };
    const token = new URL(dataUrl).pathname.slice("/api/v1/proxy/".length, -".json".length);
    expect(decodeToken(token, SECRET)).toMatchObject({
      kind: PROXY_TOKEN_KIND.itinerary,
      arrival: { lon: 3.623693, lat: 49.564267, },
    });
  });
});
