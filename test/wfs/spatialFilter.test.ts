import { describe, expect, it } from "vitest";

import { getSpatialFilter } from "../../src/wfs/spatialFilter";
import {
  gpfGetFeaturesInputSchema,
  type GpfGetFeaturesInput,
} from "../../src/wfs/schema";

const baseInput: GpfGetFeaturesInput = {
  typename: "ADMINEXPRESS-COG.LATEST:commune",
  limit: 100,
  spatial_extras: [],
  buffer: 0,
};

describe("getSpatialFilter", () => {
  it("should return undefined when no spatial filter is provided", () => {
    expect(getSpatialFilter(baseInput)).toBeUndefined();
  });

  it("should map a intersects_point_filter with a positive buffer to the compiler spatial filter", () => {
    const input: GpfGetFeaturesInput = {
      ...baseInput,
      intersects_point_filter: {
        lon: 2.3522,
        lat: 48.8566,
      },
      buffer: 500,
    };

    expect(getSpatialFilter(input)).toEqual({
      operator: "intersects_point",
      lon: 2.3522,
      lat: 48.8566,
      buffer: 500,
    });
  });

  it("should map an isoline_filter to the compiler spatial filter", () => {
    const input: GpfGetFeaturesInput = {
      ...baseInput,
      isoline_filter: {
        lon: 2.3522,
        lat: 48.8566,
        cost_type: "time",
        cost_value: 15,
        profile: "pedestrian",
      },
    };

    expect(getSpatialFilter(input)).toEqual({
      operator: "isoline",
      lon: 2.3522,
      lat: 48.8566,
      cost_type: "time",
      cost_value: 15,
      profile: "pedestrian",
      buffer: 0,
    });
  });
});

describe("gpfGetFeaturesInputSchema spatial filters", () => {
  it("should validate bbox filters", () => {
    expect(gpfGetFeaturesInputSchema.parse({
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
    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      intersects_point_filter: {
        lon: 2.3522,
      },
    })).toThrow();
  });

  it("should reject fields from another spatial filter mode", () => {
    expect(() => gpfGetFeaturesInputSchema.parse({
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
    expect(() => gpfGetFeaturesInputSchema.parse({
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
    })).toThrow("Un seul filtre spatial est autorisé");
  });

  it("should validate isoline filters", () => {
    expect(gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      isoline_filter: {
        lon: 2.3522,
        lat: 48.8566,
        cost_type: "time",
        cost_value: 600,
        profile: "car",
      },
    }).isoline_filter).toEqual({
      lon: 2.3522,
      lat: 48.8566,
      cost_type: "time",
      cost_value: 600,
      profile: "car",
    });
  });

  it("should reject invalid isoline filters", () => {
    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      isoline_filter: {
        lon: 2.3522,
        lat: 48.8566,
        cost_type: "time",
        cost_value: 0,
        profile: "pedestrian",
      },
    })).toThrow();

    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      isoline_filter: {
        lon: 2.3522,
        lat: 48.8566,
        cost_type: "time",
        cost_value: 601,
        profile: "pedestrian",
      },
    })).toThrow();

    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      isoline_filter: {
        lon: 2.3522,
        lat: 48.8566,
        cost_type: "distance",
        cost_value: 50001,
        profile: "pedestrian",
      },
    })).toThrow();

    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      isoline_filter: {
        lon: 2.3522,
        lat: 48.8566,
        cost_type: "time",
        cost_value: 15,
        profile: "bicycle",
      },
    })).toThrow();
  });

  it("should reject legacy flat spatial parameters", () => {
    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      spatial_operator: "bbox",
    })).toThrow();
  });

  it("should reject legacy dwithin_point spatial filter", () => {
    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      dwithin_point_filter: {
        lon: 2.3522,
        lat: 48.8566,
        distance_m: 500,
      }
    })).toThrow();
  });

  it("should reject invalid negative buffer", () => {
    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      intersects_point_filter: {
        lon: 2.3,
        lat: 48.8,
      },
      buffer: -30,
    })).toThrow("Impossible d'utiliser un buffer négatif avec intersects_point_filter");
  });

  it("should reject a buffer without a spatial filter", () => {
    expect(() => gpfGetFeaturesInputSchema.parse({
      ...baseInput,
      buffer: 100,
    })).toThrow("Impossible de spécifier un buffer non nul sans choisir un filtre spatial");
  });
});
