import { describe, expect, it } from "vitest";
import type { Collection } from "@ignfab/gpf-schema-store";

import { compileQueryParts, geometryToEwkt } from "../../src/wfs/queryPreparation";
import type { GpfWfsGetFeaturesInput } from "../../src/wfs/schema";

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
      bbox_filter: {
        west: 2.4,
        south: 48.7,
        east: 2.5,
        north: 48.8,
      },
    }, featureType);

    expect(compiled.cqlFilter).toEqual("BBOX(geometrie,2.4,48.7,2.5,48.8,'EPSG:4326')");
  });

  it("should compile point spatial filters", () => {
    const intersects = compileQueryParts({
      ...baseInput,
      intersects_point_filter: {
        lon: 2.3522,
        lat: 48.8566,
      },
    }, featureType);

    const dwithin = compileQueryParts({
      ...baseInput,
      dwithin_point_filter: {
        lon: 2.3522,
        lat: 48.8566,
        distance_m: 250,
      },
    }, featureType);

    expect(intersects.cqlFilter).toEqual("INTERSECTS(geometrie,SRID=4326;POINT(2.3522 48.8566))");
    expect(dwithin.cqlFilter).toEqual("DWITHIN(geometrie,SRID=4326;POINT(2.3522 48.8566),250,meters)");
  });

  it("should compile intersects_feature with resolved geometry", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      intersects_feature_filter: {
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      },
    }, featureType, {
      geometry_ewkt: "SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48,2 48)))",
    });

    expect(compiled.cqlFilter).toEqual("INTERSECTS(geometrie,SRID=4326;MULTIPOLYGON(((2 48,2.2 48,2.2 48.2,2 48,2 48))))");
  });

  it("should compile travel_time with resolved isochrone geometry", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      travel_time_filter: {
        lon: 2.3522,
        lat: 48.8566,
        minutes: 15,
        profile: "pedestrian",
      },
    }, featureType, {
      geometry_ewkt: "SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48))",
    });

    expect(compiled.cqlFilter).toEqual("INTERSECTS(geometrie,SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48)))");
  });

  it("should reject geometric properties in select", () => {
    expect(() => compileQueryParts({
      ...baseInput,
      select: ["geometrie"],
    }, featureType)).toThrow("`select` accepte uniquement");
  });

  it("should append geometry to propertyName for HTTP preview modes when select is provided", () => {
    const compiled = compileQueryParts({
      ...baseInput,
      result_type: "http_post_request",
      select: ["code_insee", "population"],
    }, featureType);

    expect(compiled.propertyName).toEqual("code_insee,population,geometrie");
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
