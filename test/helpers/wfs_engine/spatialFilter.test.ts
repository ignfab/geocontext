import { getSpatialFilter } from "../../../src/helpers/wfs_engine/spatialFilter";
import {
  gpfWfsGetFeaturesInputSchema,
  type GpfWfsGetFeaturesInput,
} from "../../../src/helpers/wfs_engine/schema";

// --- Shared fixtures ---

const baseInput: GpfWfsGetFeaturesInput = {
  typename: "ADMINEXPRESS-COG.LATEST:commune",
  limit: 100,
  result_type: "results",
};

function parseInput(input: Record<string, unknown>): GpfWfsGetFeaturesInput {
  return gpfWfsGetFeaturesInputSchema.parse(input);
}

// --- getSpatialFilter ---

describe("getSpatialFilter", () => {
  it("should return undefined when spatial_filter is absent", () => {
    expect(getSpatialFilter(baseInput)).toBeUndefined();
  });

  it("should return a bbox filter", () => {
    const input = parseInput({
      ...baseInput,
      spatial_filter: {
        type: "bbox",
        bbox: {
          west: 2.1,
          south: 48.7,
          east: 2.5,
          north: 48.9,
        },
      },
    });

    expect(getSpatialFilter(input)).toEqual({
      type: "bbox",
      bbox: {
        west: 2.1,
        south: 48.7,
        east: 2.5,
        north: 48.9,
      },
    });
  });

  it("should return an intersects_point filter", () => {
    const input = parseInput({
      ...baseInput,
      spatial_filter: {
        type: "intersects_point",
        point: {
          lon: 2.3522,
          lat: 48.8566,
        },
      },
    });

    expect(getSpatialFilter(input)).toEqual({
      type: "intersects_point",
      point: {
        lon: 2.3522,
        lat: 48.8566,
      },
    });
  });

  it("should return a dwithin_point filter", () => {
    const input = parseInput({
      ...baseInput,
      spatial_filter: {
        type: "dwithin_point",
        point: {
          lon: 2.3522,
          lat: 48.8566,
        },
        distance_m: 500,
      },
    });

    expect(getSpatialFilter(input)).toEqual({
      type: "dwithin_point",
      point: {
        lon: 2.3522,
        lat: 48.8566,
      },
      distance_m: 500,
    });
  });

  it("should return an intersects_feature filter", () => {
    const input = parseInput({
      ...baseInput,
      spatial_filter: {
        type: "intersects_feature",
        feature_ref: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.8952",
        },
      },
    });

    expect(getSpatialFilter(input)).toEqual({
      type: "intersects_feature",
      feature_ref: {
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.8952",
      },
    });
  });
});

// --- schema validation ---

describe("gpfWfsGetFeaturesInputSchema spatial_filter", () => {
  it("should reject incomplete bbox objects", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "bbox",
        bbox: {
          west: 2.1,
          south: 48.7,
          east: 2.5,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject incomplete intersects_point objects", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "intersects_point",
        point: {
          lat: 48.8566,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject incomplete dwithin_point objects", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "dwithin_point",
        point: {
          lon: 2.3522,
          lat: 48.8566,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject incomplete intersects_feature objects", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "intersects_feature",
        feature_ref: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject extra keys at the spatial_filter level", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "bbox",
        bbox: {
          west: 2.1,
          south: 48.7,
          east: 2.5,
          north: 48.9,
        },
        distance_m: 100,
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject extra keys inside bbox", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "bbox",
        bbox: {
          west: 2.1,
          south: 48.7,
          east: 2.5,
          north: 48.9,
          lon: 2.3,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject extra keys inside point", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "intersects_point",
        point: {
          lon: 2.3522,
          lat: 48.8566,
          west: 2.1,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject extra keys inside feature_ref", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "intersects_feature",
        feature_ref: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.8952",
          lon: 2.3,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("should reject mixed bbox and dwithin payloads in the same object", () => {
    const result = gpfWfsGetFeaturesInputSchema.safeParse({
      ...baseInput,
      spatial_filter: {
        type: "bbox",
        bbox: {
          west: 2.1,
          south: 48.7,
          east: 2.5,
          north: 48.9,
        },
        point: {
          lon: 2.3522,
          lat: 48.8566,
        },
        distance_m: 100,
      },
    });

    expect(result.success).toBe(false);
  });
});
