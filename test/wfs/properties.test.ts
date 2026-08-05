import { describe, expect, it } from "vitest";
import type { OgcCollectionSchema, OgcCollectionProperty } from "@ignfab/gpf-schema-store";
import {
  getGeometryName,
  resolveNonGeometryProperty,
  validateSelectProperty,
  buildPropertyName,
} from "../../src/wfs/properties";
import type { GpfGetFeaturesInput } from "../../src/wfs/schema";

// --- Test fixtures ---

const geometryProperty: OgcCollectionProperty = {
  format: "geometry-any",
  "x-ogc-role": "primary-geometry",
};

const nameProperty: OgcCollectionProperty = {
  type: "string",
};

const populationProperty: OgcCollectionProperty = {
  type: "integer",
};

const altitudeProperty: OgcCollectionProperty = {
  format: "geometry-any"
};

const singleGeometryCollection: OgcCollectionSchema = {
  type: "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: "SingleGeo",
  description: "description de la collection SingleGeo",
  properties: {
    geometry: geometryProperty,
    name: nameProperty,
    population: populationProperty,
  },
  required: [],
};

const multipleGeometryCollection: OgcCollectionSchema = {
  type: "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: "MultiGeo",
  description: "description de la collection MultiGeo",
  properties: {
    geometry: geometryProperty,
    name: nameProperty,
    altitude: altitudeProperty,
  },
  required: [],
};

const noGeometryCollection: OgcCollectionSchema = {
  type: "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: "NoGeo",
  description: "description de la collection NoGeo",
  properties: {
    name: nameProperty,
    population: populationProperty,
  },
  required: [],
};

// --- Tests ---

describe("getGeometryName", () => {
  it("should return the geometry property when there is exactly one", () => {
    const result = getGeometryName(singleGeometryCollection);
    expect(result).toEqual("geometry");
  });

  it("should throw when no geometry property exists", () => {
    expect(() => getGeometryName(noGeometryCollection)).toThrow(
      "Erreur du catalogue embarqué : la collection 'NoGeo' n'expose aucune propriété géométrique exploitable.",
    );
  });

  it("should throw when multiple geometry properties exist", () => {
    expect(() => getGeometryName(multipleGeometryCollection)).toThrow(
      "La collection 'MultiGeo' expose plusieurs propriétés géométriques dans le catalogue embarqué : geometry, altitude.",
    );
  });
});

describe("resolveNonGeometryProperty", () => {
  it("should return the property when it is non-geometric", () => {
    const result = resolveNonGeometryProperty(
      singleGeometryCollection,
      "name",
      "Error message",
    );
    expect(result).toEqual(nameProperty);
  });

  it("should include missing-property context and available non-geometric properties", () => {
    let thrown: unknown;

    try {
      resolveNonGeometryProperty(
        singleGeometryCollection,
        "invalid_prop",
        "Error message",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("La propriété 'invalid_prop' n'existe pas");
    expect((thrown as Error).message).toContain("Propriétés non géométriques disponibles : name, population");
  });

  it("should throw when the property is geometric", () => {
    expect(() =>
      resolveNonGeometryProperty(
        singleGeometryCollection,
        "geometry",
        "Error message",
      ),
    ).toThrow("La propriété 'geometry' est géométrique.");
  });
});

describe("validateSelectProperty", () => {
  it("should keep resolveNonGeometryProperty semantics for success and failure paths", () => {
    expect(validateSelectProperty(singleGeometryCollection, "name")).toBe("name");
    expect(() =>
      validateSelectProperty(singleGeometryCollection, "geometry"),
    ).toThrow(
      "La propriété 'geometry' est géométrique. `select` accepte uniquement des propriétés non géométriques.",
    );
    expect(() =>
      validateSelectProperty(singleGeometryCollection, "invalid_prop"),
    ).toThrow(/Propriétés non géométriques disponibles : name, population/);
  });
});

describe("buildPropertyName", () => {
  it("should return all non-geometric properties when select is omitted", () => {
    const result = buildPropertyName(singleGeometryCollection);
    expect(result).toEqual("name,population");
  });

  it("should include geometry when spatial_extras is provided", () => {
    const result = buildPropertyName(singleGeometryCollection, undefined, ["bbox"]);
    expect(result).toEqual("geometry,name,population");
  });

  it("should return only selected non-geometric properties when select is specified", () => {
    const result = buildPropertyName(singleGeometryCollection, ["name"]);
    expect(result).toEqual("name");
  });

  it("should append geometry to selected properties when spatial_extras is provided", () => {
    const result = buildPropertyName(singleGeometryCollection, ["name", "population"], ["bbox", "centroid"]);
    expect(result).toEqual("name,population,geometry");
  });

  it("should throw when a selected property does not exist", () => {
    expect(() => buildPropertyName(singleGeometryCollection, ["invalid_prop"])).toThrow(
      /La propriété 'invalid_prop' n'existe pas/,
    );
  });

  it("should throw when a selected property is geometric", () => {
    expect(() => buildPropertyName(singleGeometryCollection, ["geometry"])).toThrow(
      "La propriété 'geometry' est géométrique. `select` accepte uniquement des propriétés non géométriques.",
    );
  });
});
