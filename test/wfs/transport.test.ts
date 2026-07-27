import { vi, describe, expect, afterEach, it } from "vitest";

const mockFetchJSONPost = vi.fn<(
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<unknown>>();

vi.doMock("../../src/helpers/http.js", () => ({
  fetchJSONPost: mockFetchJSONPost,
}));

const { WfsTransport } = await import("../../src/wfs/transport");
const { RateLimiter } = await import("../../src/helpers/RateLimiter");

describe("WfsTransport", () => {
  afterEach(() => {
    mockFetchJSONPost.mockReset();
  });

  it("should build URL from query params and POST with correct headers", async () => {
    mockFetchJSONPost.mockResolvedValue({ type: "FeatureCollection", features: [] });

    const transport = new WfsTransport(new RateLimiter({ name: "test", maxCalls: 10, period: 1 }));

    const request = {
      method: "POST" as const,
      url: "https://data.geopf.fr/wfs",
      query: { service: "WFS", version: "2.0.0", request: "GetFeature" },
      body: "cql_filter=code_insee%3D'75056'",
    };

    const result = await transport.post(request);

    expect(mockFetchJSONPost).toHaveBeenCalledTimes(1);
    const [calledUrl, calledBody, calledHeaders] = mockFetchJSONPost.mock.calls[0]!;

    const parsedUrl = new URL(calledUrl);
    expect(parsedUrl.origin + parsedUrl.pathname).toEqual("https://data.geopf.fr/wfs");
    expect(parsedUrl.searchParams.get("service")).toEqual("WFS");
    expect(parsedUrl.searchParams.get("version")).toEqual("2.0.0");
    expect(parsedUrl.searchParams.get("request")).toEqual("GetFeature");

    expect(calledBody).toEqual("cql_filter=code_insee%3D'75056'");
    expect(calledHeaders).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    });

    expect(result).toMatchObject({ type: "FeatureCollection", features: [] });
  });

  it("should enforce rate limiting before posting", async () => {
    const transport = new WfsTransport(new RateLimiter({ name: "strict", maxCalls: 1, period: 1 }));

    mockFetchJSONPost.mockResolvedValue({ features: [] });

    const request = {
      method: "POST" as const,
      url: "https://data.geopf.fr/wfs",
      query: { service: "WFS" },
      body: "",
    };

    await transport.post(request);
    await expect(transport.post(request)).rejects.toThrow("Rate limit exceeded");
  });
});
