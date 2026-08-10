import { describe, expect, it } from "vitest";
import type { OgcCollectionSchema, OgcCollectionProperty } from "@ignfab/gpf-schema-store";
import type { GpfFeatureType } from "../../src/wfs/catalog";
import {
  getGeometryName,
  resolveNonGeometryProperty,
  validateSelectProperty,
  buildPropertyName,
} from "../../src/wfs/properties";

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

const anotherPrimaryGeometryProperty: OgcCollectionProperty = {
  // This is forbidden by OGC API Features: test here for malformed collections.
  format: "geometry-any",
  "x-ogc-role": "primary-geometry",
};

const singleGeometryCollection: OgcCollectionSchema = {
  type: "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.test/SINGLE/GEO.json",
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
  "$id": "https://example.test/MULTI/GEO.json",
  title: "MultiGeo",
  description: "description de la collection MultiGeo",
  properties: {
    geometry: geometryProperty,
    name: nameProperty,
    altitude: altitudeProperty,
  },
  required: [],
};

const ambiguousGeometryCollection: OgcCollectionSchema = {
  type: "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.test/AMBIGUOUS/GEO.json",
  title: "AmbiguousGeo",
  description: "description de la collection AmbiguousGeo",
  properties: {
    geometry: geometryProperty,
    name: nameProperty,
    contour: anotherPrimaryGeometryProperty,
  },
  required: [],
};

const noGeometryCollection: OgcCollectionSchema = {
  type: "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.test/NO_GEO/TYPE.json",
  title: "NoGeo",
  description: "description de la collection NoGeo",
  properties: {
    name: nameProperty,
    population: populationProperty,
  },
  required: [],
};

function asFeatureType(typename: string, schema: OgcCollectionSchema): GpfFeatureType {
  return { typename, schema };
}

// --- Tests ---

describe("getGeometryName", () => {
  it("should return the geometry property when there is exactly one", () => {
    const result = getGeometryName(asFeatureType("SINGLE:GEO", singleGeometryCollection));
    expect(result).toEqual("geometry");
  });

  it("should throw when no geometry property exists", () => {
    expect(() => getGeometryName(asFeatureType("NO_GEO:TYPE", noGeometryCollection))).toThrow(
      "Erreur du catalogue embarqué : le type 'NO_GEO:TYPE' n'expose aucune propriété géométrique exploitable."
    );
  });

  it("should return the property marked 'x-ogc-role': 'primary-geometry' when multiple geometry properties exist", () => {
    const result = getGeometryName(asFeatureType("MULTI:GEO", multipleGeometryCollection));
    expect(result).toEqual("geometry");
  });

  it("should throw when multiple geometry properties exist and none, or more than one, is marked 'x-ogc-role': 'primary-geometry'", () => {
    expect(() => getGeometryName(asFeatureType("AMBIGUOUS:GEO", ambiguousGeometryCollection))).toThrow(
      "Le type 'AMBIGUOUS:GEO' expose plusieurs propriétés géométriques dans le catalogue embarqué : geometry, contour."
    );
  });
});

describe("resolveNonGeometryProperty", () => {
  it("should return the property when it is non-geometric", () => {
    const result = resolveNonGeometryProperty(
      asFeatureType("SINGLE:GEO", singleGeometryCollection),
      "name",
      "Error message",
    );
    expect(result).toEqual(nameProperty);
  });

  it("should include missing-property context and available non-geometric properties", () => {
    let thrown: unknown;

    try {
      resolveNonGeometryProperty(
        asFeatureType("SINGLE:GEO", singleGeometryCollection),
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

  it("should throw 'n'existe pas' and not 'est géométrique' for prototype property 'toString'", () => {
    expect(() =>
      resolveNonGeometryProperty(
        asFeatureType("SINGLE:GEO", singleGeometryCollection),
        "toString",
        "Error message",
      ),
    ).toThrow("La propriété 'toString' n'existe pas");
  });

  it("should throw when the property is geometric", () => {
    expect(() =>
      resolveNonGeometryProperty(
        asFeatureType("SINGLE:GEO", singleGeometryCollection),
        "geometry",
        "Error message",
      ),
    ).toThrow("La propriété 'geometry' est géométrique.");
  });
});

describe("validateSelectProperty", () => {
  it("should keep resolveNonGeometryProperty semantics for success and failure paths", () => {
    expect(validateSelectProperty(asFeatureType("SINGLE:GEO", singleGeometryCollection), "name")).toBe("name");
    expect(() =>
      validateSelectProperty(asFeatureType("SINGLE:GEO", singleGeometryCollection), "geometry"),
    ).toThrow(
      "La propriété 'geometry' est géométrique. `select` accepte uniquement des propriétés non géométriques.",
    );
    expect(() =>
      validateSelectProperty(asFeatureType("SINGLE:GEO", singleGeometryCollection), "invalid_prop"),
    ).toThrow(/Propriétés non géométriques disponibles : name, population/);
  });
});

describe("buildPropertyName", () => {
  it("should return all non-geometric properties when select is omitted", () => {
    const result = buildPropertyName(asFeatureType("SINGLE:GEO", singleGeometryCollection));
    expect(result).toEqual("name,population");
  });

  it("should include geometry when spatial_extras is provided", () => {
    const result = buildPropertyName(asFeatureType("SINGLE:GEO", singleGeometryCollection), undefined, ["bbox"]);
    expect(result).toEqual("geometry,name,population");
  });

  it("should return only selected non-geometric properties when select is specified", () => {
    const result = buildPropertyName(asFeatureType("SINGLE:GEO", singleGeometryCollection), ["name"]);
    expect(result).toEqual("name");
  });

  it("should append geometry to selected properties when spatial_extras is provided", () => {
    const result = buildPropertyName(asFeatureType("SINGLE:GEO", singleGeometryCollection), ["name", "population"], ["bbox", "centroid"]);
    expect(result).toEqual("name,population,geometry");
  });

  it("should throw when a selected property does not exist", () => {
    expect(() => buildPropertyName(asFeatureType("SINGLE:GEO", singleGeometryCollection), ["invalid_prop"])).toThrow(
      /La propriété 'invalid_prop' n'existe pas/,
    );
  });

  it("should throw when a selected property is geometric", () => {
    expect(() => buildPropertyName(asFeatureType("SINGLE:GEO", singleGeometryCollection), ["geometry"])).toThrow(
      "La propriété 'geometry' est géométrique. `select` accepte uniquement des propriétés non géométriques.",
    );
  });
});
