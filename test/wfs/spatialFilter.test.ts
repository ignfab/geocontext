import { describe, expect, it } from "vitest";

import { getSpatialFilter } from "../../src/wfs/spatialFilter";
import {
  gpfWfsGetFeaturesInputSchema,
  type GpfWfsGetFeaturesInput,
} from "../../src/wfs/schema";

const baseInput: GpfWfsGetFeaturesInput = {
  typename: "ADMINEXPRESS-COG.LATEST:commune",
  limit: 100,
  result_type: "results",
};

describe("getSpatialFilter", () => {
  it("should return undefined when no spatial filter is provided", () => {
    expect(getSpatialFilter(baseInput)).toBeUndefined();
  });

  it("should map a dwithin_point_filter to the compiler spatial filter", () => {
    const input: GpfWfsGetFeaturesInput = {
      ...baseInput,
      dwithin_point_filter: {
        lon: 2.3522,
        lat: 48.8566,
        distance_m: 500,
      },
    };

    expect(getSpatialFilter(input)).toEqual({
      operator: "dwithin_point",
      lon: 2.3522,
      lat: 48.8566,
      distance_m: 500,
    });
  });
});

describe("gpfWfsGetFeaturesInputSchema spatial filters", () => {
  it("should validate bbox filters", () => {
    expect(gpfWfsGetFeaturesInputSchema.parse({
      ...baseInput,
      bbox_filter: {
        west: 2.1,
        south: 48.7,
        east: 2.5,
        north: 48.9,
      },
    }).bbox_filter).toEqual({
      west: 2.1,
      south: 48.7,
      east: 2.5,
      north: 48.9,
    });
  });

  it("should reject incomplete spatial filters", () => {
    expect(() => gpfWfsGetFeaturesInputSchema.parse({
      ...baseInput,
      intersects_point_filter: {
        lon: 2.3522,
      },
    })).toThrow();
  });

  it("should reject fields from another spatial filter mode", () => {
    expect(() => gpfWfsGetFeaturesInputSchema.parse({
      ...baseInput,
      bbox_filter: {
        west: 2.1,
        south: 48.7,
        east: 2.5,
        north: 48.9,
        lon: 2.3,
      },
    })).toThrow();
  });

  it("should reject multiple spatial filters", () => {
    const input = gpfWfsGetFeaturesInputSchema.parse({
      ...baseInput,
      bbox_filter: {
        west: 2.1,
        south: 48.7,
        east: 2.5,
        north: 48.9,
      },
      intersects_point_filter: {
        lon: 2.3,
        lat: 48.8,
      },
    });

    expect(() => getSpatialFilter(input)).toThrow("Un seul filtre spatial est autorisé");
  });

  it("should reject legacy flat spatial parameters", () => {
    expect(() => gpfWfsGetFeaturesInputSchema.parse({
      ...baseInput,
      spatial_operator: "bbox",
    })).toThrow();
  });
});
