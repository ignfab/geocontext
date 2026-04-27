import { getSpatialFilter } from "../../../src/helpers/wfs_engine/spatialFilter";
import type { GpfWfsGetFeaturesInput } from "../../../src/helpers/wfs_engine/schema";

// --- Shared fixtures ---

const baseInput: GpfWfsGetFeaturesInput = {
  typename: "ADMINEXPRESS-COG.LATEST:commune",
  limit: 100,
  result_type: "results",
};

// --- getSpatialFilter: no operator ---

describe("getSpatialFilter — no operator", () => {
  it("should return undefined when no spatial_operator and no spatial params", () => {
    expect(getSpatialFilter(baseInput)).toBeUndefined();
  });

  it("should throw when stray bbox params are present without spatial_operator", () => {
    expect(() =>
      getSpatialFilter({ ...baseInput, bbox_west: 2.0 }),
    ).toThrow("paramètres spatiaux exigent `spatial_operator`");
  });

  it("should throw when stray intersects_point params are present without spatial_operator", () => {
    expect(() =>
      getSpatialFilter({ ...baseInput, intersects_lon: 2.3 }),
    ).toThrow("paramètres spatiaux exigent `spatial_operator`");
  });

  it("should throw when stray dwithin params are present without spatial_operator", () => {
    expect(() =>
      getSpatialFilter({ ...baseInput, dwithin_lon: 2.3 }),
    ).toThrow("paramètres spatiaux exigent `spatial_operator`");
  });

  it("should throw when stray intersects_feature params are present without spatial_operator", () => {
    expect(() =>
      getSpatialFilter({ ...baseInput, intersects_feature_typename: "TEST:type" }),
    ).toThrow("paramètres spatiaux exigent `spatial_operator`");
  });
});

// --- getSpatialFilter: bbox ---

describe("getSpatialFilter — bbox", () => {
  it("should return a bbox filter when all bbox params are provided", () => {
    const result = getSpatialFilter({
      ...baseInput,
      spatial_operator: "bbox",
      bbox_west: 2.1,
      bbox_south: 48.7,
      bbox_east: 2.5,
      bbox_north: 48.9,
    });

    expect(result).toEqual({
      operator: "bbox",
      west: 2.1,
      south: 48.7,
      east: 2.5,
      north: 48.9,
    });
  });

  it("should throw when bbox params are incomplete (missing north)", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "bbox",
        bbox_west: 2.1,
        bbox_south: 48.7,
        bbox_east: 2.5,
      }),
    ).toThrow("Le filtre spatial `bbox` exige `bbox_west`, `bbox_south`, `bbox_east` et `bbox_north`");
  });

  it("should throw when bbox operator is used with intersects_point params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "bbox",
        bbox_west: 2.1,
        bbox_south: 48.7,
        bbox_east: 2.5,
        bbox_north: 48.9,
        intersects_lon: 2.3,
      }),
    ).toThrow("Le filtre spatial `bbox` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when bbox operator is used with dwithin params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "bbox",
        bbox_west: 2.1,
        bbox_south: 48.7,
        bbox_east: 2.5,
        bbox_north: 48.9,
        dwithin_distance_m: 100,
      }),
    ).toThrow("Le filtre spatial `bbox` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when bbox operator is used with intersects_feature params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "bbox",
        bbox_west: 2.1,
        bbox_south: 48.7,
        bbox_east: 2.5,
        bbox_north: 48.9,
        intersects_feature_typename: "TEST:type",
      }),
    ).toThrow("Le filtre spatial `bbox` n'accepte pas les paramètres d'un autre mode spatial");
  });
});

// --- getSpatialFilter: intersects_point ---

describe("getSpatialFilter — intersects_point", () => {
  it("should return an intersects_point filter when lon/lat are provided", () => {
    const result = getSpatialFilter({
      ...baseInput,
      spatial_operator: "intersects_point",
      intersects_lon: 2.3522,
      intersects_lat: 48.8566,
    });

    expect(result).toEqual({
      operator: "intersects_point",
      lon: 2.3522,
      lat: 48.8566,
    });
  });

  it("should throw when intersects_lon is missing", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_point",
        intersects_lat: 48.8566,
      }),
    ).toThrow("Le filtre spatial `intersects_point` exige `intersects_lon` et `intersects_lat`");
  });

  it("should throw when intersects_lat is missing", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_point",
        intersects_lon: 2.3522,
      }),
    ).toThrow("Le filtre spatial `intersects_point` exige `intersects_lon` et `intersects_lat`");
  });

  it("should throw when intersects_point operator is used with bbox params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_point",
        intersects_lon: 2.3522,
        intersects_lat: 48.8566,
        bbox_west: 2.0,
      }),
    ).toThrow("Le filtre spatial `intersects_point` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when intersects_point operator is used with dwithin params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_point",
        intersects_lon: 2.3522,
        intersects_lat: 48.8566,
        dwithin_distance_m: 100,
      }),
    ).toThrow("Le filtre spatial `intersects_point` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when intersects_point operator is used with intersects_feature params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_point",
        intersects_lon: 2.3522,
        intersects_lat: 48.8566,
        intersects_feature_id: "feature.1",
      }),
    ).toThrow("Le filtre spatial `intersects_point` n'accepte pas les paramètres d'un autre mode spatial");
  });
});

// --- getSpatialFilter: dwithin_point ---

describe("getSpatialFilter — dwithin_point", () => {
  it("should return a dwithin_point filter when lon/lat/distance are provided", () => {
    const result = getSpatialFilter({
      ...baseInput,
      spatial_operator: "dwithin_point",
      dwithin_lon: 2.3522,
      dwithin_lat: 48.8566,
      dwithin_distance_m: 500,
    });

    expect(result).toEqual({
      operator: "dwithin_point",
      lon: 2.3522,
      lat: 48.8566,
      distance_m: 500,
    });
  });

  it("should throw when dwithin_distance_m is missing", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "dwithin_point",
        dwithin_lon: 2.3522,
        dwithin_lat: 48.8566,
      }),
    ).toThrow("Le filtre spatial `dwithin_point` exige `dwithin_lon`, `dwithin_lat` et `dwithin_distance_m`");
  });

  it("should throw when dwithin_lon is missing", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "dwithin_point",
        dwithin_lat: 48.8566,
        dwithin_distance_m: 500,
      }),
    ).toThrow("Le filtre spatial `dwithin_point` exige `dwithin_lon`, `dwithin_lat` et `dwithin_distance_m`");
  });

  it("should throw when dwithin_point operator is used with bbox params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "dwithin_point",
        dwithin_lon: 2.3522,
        dwithin_lat: 48.8566,
        dwithin_distance_m: 500,
        bbox_north: 49.0,
      }),
    ).toThrow("Le filtre spatial `dwithin_point` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when dwithin_point operator is used with intersects_point params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "dwithin_point",
        dwithin_lon: 2.3522,
        dwithin_lat: 48.8566,
        dwithin_distance_m: 500,
        intersects_lat: 48.0,
      }),
    ).toThrow("Le filtre spatial `dwithin_point` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when dwithin_point operator is used with intersects_feature params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "dwithin_point",
        dwithin_lon: 2.3522,
        dwithin_lat: 48.8566,
        dwithin_distance_m: 500,
        intersects_feature_typename: "TEST:type",
      }),
    ).toThrow("Le filtre spatial `dwithin_point` n'accepte pas les paramètres d'un autre mode spatial");
  });
});

// --- getSpatialFilter: intersects_feature ---

describe("getSpatialFilter — intersects_feature", () => {
  it("should return an intersects_feature filter when typename and feature_id are provided", () => {
    const result = getSpatialFilter({
      ...baseInput,
      spatial_operator: "intersects_feature",
      intersects_feature_typename: "ADMINEXPRESS-COG.LATEST:commune",
      intersects_feature_id: "commune.8952",
    });

    expect(result).toEqual({
      operator: "intersects_feature",
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.8952",
    });
  });

  it("should throw when intersects_feature_typename is missing", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_id: "commune.8952",
      }),
    ).toThrow("Le filtre spatial `intersects_feature` exige `intersects_feature_typename` et `intersects_feature_id`");
  });

  it("should throw when intersects_feature_typename is an empty string", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_typename: "",
        intersects_feature_id: "commune.8952",
      }),
    ).toThrow("Le filtre spatial `intersects_feature` exige `intersects_feature_typename` et `intersects_feature_id`");
  });

  it("should throw when intersects_feature_id is missing", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_typename: "ADMINEXPRESS-COG.LATEST:commune",
      }),
    ).toThrow("Le filtre spatial `intersects_feature` exige `intersects_feature_typename` et `intersects_feature_id`");
  });

  it("should throw when intersects_feature_id is an empty string", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_typename: "ADMINEXPRESS-COG.LATEST:commune",
        intersects_feature_id: "",
      }),
    ).toThrow("Le filtre spatial `intersects_feature` exige `intersects_feature_typename` et `intersects_feature_id`");
  });

  it("should throw when intersects_feature operator is used with bbox params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_typename: "TEST:type",
        intersects_feature_id: "feature.1",
        bbox_south: 48.0,
      }),
    ).toThrow("Le filtre spatial `intersects_feature` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when intersects_feature operator is used with intersects_point params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_typename: "TEST:type",
        intersects_feature_id: "feature.1",
        intersects_lon: 2.3,
      }),
    ).toThrow("Le filtre spatial `intersects_feature` n'accepte pas les paramètres d'un autre mode spatial");
  });

  it("should throw when intersects_feature operator is used with dwithin params", () => {
    expect(() =>
      getSpatialFilter({
        ...baseInput,
        spatial_operator: "intersects_feature",
        intersects_feature_typename: "TEST:type",
        intersects_feature_id: "feature.1",
        dwithin_lon: 2.3,
      }),
    ).toThrow("Le filtre spatial `intersects_feature` n'accepte pas les paramètres d'un autre mode spatial");
  });
});
