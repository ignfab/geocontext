import { describe, it, expect } from "vitest";

import { ISOCHRONE_SOURCE, type IsochroneFeatureCollection } from "../../src/gpf/isochrone";
import IsochroneTool from "../../src/tools/IsochroneTool";
import { paris } from "../samples";

const isochroneFeatureCollection: IsochroneFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        source: ISOCHRONE_SOURCE,
        point: "2.333333,48.866667",
        resource: "bdtopo-valhalla",
        resourceVersion: "2026-05-18",
        costType: "distance",
        costValue: 500,
        distanceUnit: "meter",
        timeUnit: "second",
        profile: "pedestrian",
        direction: "departure",
        crs: "EPSG:4326",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.33, 48.86],
            [2.34, 48.86],
            [2.34, 48.87],
            [2.33, 48.87],
            [2.33, 48.86],
          ],
        ],
      },
    },
  ],
};

describe("Test IsochroneTool", () => {
  class TestableIsochroneTool extends IsochroneTool {
    async execute(): Promise<IsochroneFeatureCollection> {
      return isochroneFeatureCollection;
    }
  }

  it("should expose an enriched MCP definition", () => {
    const tool = new IsochroneTool();
    expect(tool.toolDefinition.title).toEqual("Isochrone et isodistance");
    expect(tool.toolDefinition.inputSchema.properties?.lon).toMatchObject({
      type: "number",
      minimum: -180,
      maximum: 180,
    });
    expect(tool.toolDefinition.inputSchema.properties?.lat).toMatchObject({
      type: "number",
      minimum: -90,
      maximum: 90,
    });
    expect(tool.toolDefinition.inputSchema.properties?.cost_type).toMatchObject({
      type: "string",
      enum: ["time", "distance"],
    });
    expect(tool.toolDefinition.inputSchema.properties?.result_type).toMatchObject({
      type: "string",
      enum: ["results", "request"],
      default: "results",
    });
    expect(tool.toolDefinition.inputSchema.properties?.profile).toMatchObject({
      type: "string",
      enum: ["car", "pedestrian"],
      default: "pedestrian",
    });
    expect(tool.toolDefinition.inputSchema.properties?.constraints).toMatchObject({
      type: "array",
      maxItems: 3,
    });
    expect(tool.toolDefinition.inputSchema.properties?.resource).toBeUndefined();
    expect(tool.toolDefinition.inputSchema.properties?.crs).toBeUndefined();
    expect(tool.toolDefinition.outputSchema).toBeUndefined();
  });

  it("should return text content and structuredContent for normalized GeoJSON results", async () => {
    const c = paris.coordinates;
    const tool = new TestableIsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "distance",
          cost_value: 500,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload).toMatchObject({
      type: "FeatureCollection",
      features: [
        expect.objectContaining({
          type: "Feature",
          geometry: expect.objectContaining({
            type: "Polygon",
          }),
        }),
      ],
    });
    expect(response.structuredContent).toMatchObject(payload);
  });

  it("should return text content and structuredContent for request mode", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "time",
          cost_value: 900,
          result_type: "request",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload).toMatchObject({
      result_type: "request",
      method: "GET",
      url: "https://data.geopf.fr/navigation/isochrone",
      body: "",
    });
    expect(payload.query).toMatchObject({
      resource: "bdtopo-valhalla",
      costType: "time",
      costValue: "900",
      geometryFormat: "geojson",
    });
    expect(payload.get_url).toContain("costType=time");
    expect(response.structuredContent).toMatchObject(payload);
  });

  it("should default valhalla constraint fields in request mode", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "distance",
          cost_value: 500,
          result_type: "request",
          constraints: [{ value: "tunnel" }],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload.query.constraints).toEqual(JSON.stringify({
      constraintType: "banned",
      key: "waytype",
      operator: "=",
      value: "tunnel",
    }));
  });

  it("should reject out-of-range coordinates at the tool boundary", async () => {
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: 600,
          lat: 600,
          cost_type: "distance",
          cost_value: 500,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "lon",
          code: "too_big",
        }),
      ]),
    });
  });

  it("should reject invalid enum values", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "duration",
          cost_value: 500,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "cost_type",
          code: "invalid_enum_value",
        }),
      ]),
    });
  });

  it("should reject unsupported bike profile", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "distance",
          cost_value: 500,
          profile: "bike",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "profile",
          code: "invalid_enum_value",
        }),
      ]),
    });
  });

  it("should reject non-valhalla constraint values", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "distance",
          cost_value: 500,
          constraints: [
            {
              value: "route_empierree",
            },
          ],
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_enum_value",
          detail: expect.stringContaining("autoroute"),
        }),
      ]),
    });
  });

  it("should reject crs as a public input", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "distance",
          cost_value: 500,
          crs: "EPSG:2154",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "crs",
          code: "unknown_parameter",
        }),
      ]),
    });
  });

  it("should reject resource as a public input", async () => {
    const c = paris.coordinates;
    const tool = new IsochroneTool();
    const response = await tool.toolCall({
      params: {
        name: "isochrone",
        arguments: {
          lon: c[0],
          lat: c[1],
          cost_type: "distance",
          cost_value: 500,
          resource: "bdtopo-pgr",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "resource",
          code: "unknown_parameter",
        }),
      ]),
    });
  });
});
