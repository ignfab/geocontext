import type { Collection } from "@ignfab/gpf-schema-store";

import { compileQueryParts, geometryToEwkt } from "../../../src/helpers/wfs_engine/queryPreparation";
import type { GpfWfsGetFeaturesInput } from "../../../src/helpers/wfs_engine/schema";

describe("gpfWfsGetFeatures/queryPreparation", () => {
  const featureType: Collection = {
    id: "ADMINEXPRESS-COG.LATEST:commune",
    namespace: "ADMINEXPRESS-COG.LATEST",
    name: "commune",
    title: "Commune",
    description: "Description de test",
    properties: [
      { name: "code_insee", type: "string" },
      { name: "nature", type: "string", enum: ["Chapelle", "Eglise"] },
      { name: "population", type: "integer" },
      { name: "hauteur", type: "float" },
      { name: "actif", type: "boolean" },
      { name: "date_creation", type: "string" },
      { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
    ],
  };

  const baseInput: GpfWfsGetFeaturesInput = {
    typename: "ADMINEXPRESS-COG.LATEST:commune",
    limit: 100,
    result_type: "results",
  };

  it("should compile where clauses", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      where: [
        { property: "code_insee", operator: "eq", value: "94080" },
        { property: "population", operator: "gt", value: "1000" },
        { property: "actif", operator: "is_null" },
      ],
    }, featureType);

    expect(compiled.cqlFilter).toEqual("code_insee = '94080' AND population > 1000 AND actif IS NULL");
  });

  it("should compile bbox in lon lat order", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      spatial_filter: {
        type: "bbox",
        bbox: {
          west: 2.4,
          south: 48.7,
          east: 2.5,
          north: 48.8,
        },
      },
    }, featureType);

    expect(compiled.cqlFilter).toEqual("BBOX(geometrie,2.4,48.7,2.5,48.8,'EPSG:4326')");
  });

  it("should compile point spatial filters", () => {
    const intersects = compileQueryParts({
      ...baseInput,
      spatial_filter: {
        type: "intersects_point",
        point: {
          lon: 2.3522,
          lat: 48.8566,
        },
      },
    }, featureType);

    const dwithin = compileQueryParts({
      ...baseInput,
      spatial_filter: {
        type: "dwithin_point",
        point: {
          lon: 2.3522,
          lat: 48.8566,
        },
        distance_m: 250,
      },
    }, featureType);

    expect(intersects.cqlFilter).toEqual("INTERSECTS(geometrie,SRID=4326;POINT(2.3522 48.8566))");
    expect(dwithin.cqlFilter).toEqual("DWITHIN(geometrie,SRID=4326;POINT(2.3522 48.8566),250,meters)");
  });

  it("should compile intersects_feature with resolved geometry", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      spatial_filter: {
        type: "intersects_feature",
        feature_ref: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
        },
      },
    }, featureType, {
      geometry_ewkt: "SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48,2 48)))",
    });

    expect(compiled.cqlFilter).toEqual("INTERSECTS(geometrie,SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48,2 48))))");
  });

  it("should reject geometric properties in select", () => {
    expect(() => compileQueryParts({
      ...baseInput,
      select: ["geometrie"],
    }, featureType)).toThrow("`select` accepte uniquement");
  });

  it("should append geometry to propertyName for request when select is provided", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      result_type: "request",
      select: ["code_insee", "population"],
    }, featureType);

    expect(compiled.propertyName).toEqual("code_insee,population,geometrie");
  });

  it("should leave cqlFilter undefined when no where and no spatial_filter are provided", () => {
    const compiled = compileQueryParts(baseInput, featureType);

    expect(compiled.cqlFilter).toBeUndefined();
  });

  it("should build sortBy from structured order_by", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      order_by: [
        { property: "population", direction: "desc" },
        { property: "code_insee", direction: "asc" },
      ],
    }, featureType);

    expect(compiled.sortBy).toEqual("population D,code_insee A");
  });

  it("should convert referenced geometries to EWKT", () => {
    expect(geometryToEwkt({ type: "Point", coordinates: [2.3, 48.8] })).toEqual("SRID=4326;POINT(2.3 48.8)");
    expect(geometryToEwkt({ type: "MultiPoint", coordinates: [[2.3, 48.8], [2.4, 48.9]] })).toEqual("SRID=4326;MULTIPOINT((2.3 48.8),(2.4 48.9))");
    expect(geometryToEwkt({ type: "LineString", coordinates: [[2.3, 48.8], [2.4, 48.9]] })).toEqual("SRID=4326;LINESTRING(2.3 48.8,2.4 48.9)");
  });

});
