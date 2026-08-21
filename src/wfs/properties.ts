/**
 * Property resolution and validation helpers for the structured WFS query compiler.
 *
 * This module centralizes:
 * - geometry property lookup
 * - property existence checks
 * - non-geometry validation for select/order/filter compilation
 */

import type { GpfFeatureType } from "./catalog.js";
import type { OgcCollectionProperty } from "@ignfab/gpf-schema-store";
import { Geometry } from "geojson";
import { SpatialExtraOptions } from "./schema.js";

// --- Geometry Resolution ---

/**
 * Returns every geometry-like property exposed by a feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The list of spatial properties.
 */
function getGeometryProperties(featureType: GpfFeatureType) {
  return Object.entries(featureType.schema.properties).filter(([_key, property]) => {
    // only geometric properties do not have a `type` field
    // (see OGC API Features, /req/schemas/properties A and B)
    return !(property as OgcCollectionProperty).type
  }).map(([propertyName]) => propertyName);
}

/**
 * Resolves the single geometry property expected by the query compiler.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The unique geometry property name for the feature type.
 */
export function getGeometryName(featureType: GpfFeatureType) : string {
  const geometryProperties = getGeometryProperties(featureType);
  if (geometryProperties.length === 0) {
    throw new Error(`Erreur du catalogue embarqué : le type '${featureType.typename}' n'expose aucune propriété géométrique exploitable.`);
  }
  if (geometryProperties.length > 1) {
    const primaryGeometryProperties = geometryProperties.filter(
      (propertyName) => (featureType.schema.properties[propertyName] as OgcCollectionProperty)["x-ogc-role"] === "primary-geometry",
    );
    if (primaryGeometryProperties.length === 1) {
      return primaryGeometryProperties[0];
    }
    throw new Error(`Le type '${featureType.typename}' expose plusieurs propriétés géométriques dans le catalogue embarqué : ${geometryProperties.join(", ")}.`);
  }
  return geometryProperties[0];
}

function getGeometryType(featureType: GpfFeatureType, geometryName: string) : Geometry["type"] {
  const format = featureType.schema.properties[geometryName].format;
  switch(format) {
    case "geometry-point":                         return "Point";
    case "geometry-multipoint":
    case "geometry-point-or-multipoint":           return "MultiPoint";
    case "geometry-linestring":                    return "LineString";
    case "geometry-multilinestring":
    case "geometry-linestring-or-multilinestring": return "MultiLineString"
    case "geometry-polygon":                       return "Polygon";
    case "geometry-multipolygon":
    case "geometry-polygon-or-multipolygon" :      return "MultiPolygon";
    case "geometry-geometrycollection":
    case "geometry-any":                           return "GeometryCollection"
    default: {
      throw new Error(`Format interdit pour une propriété géométrique: "${format}" dans typename "${featureType.typename}"`);
    }
  }
}
function getGeometryTypeDimension(geometryType: Geometry["type"]) {
  switch (geometryType) {
    case "Point":
    case "MultiPoint": return "ponctuelle";
    case "LineString":
    case "MultiLineString": return "linéaire";
    case "Polygon":
    case "MultiPolygon": return "surfacique";
    case "GeometryCollection": return "?";
  }
}

// --- Non-Geometry Validation ---

/**
 * Resolves a property by exact name and ensures it is not the geometry column
 * of the feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param propertyName Exact property name requested by the caller.
 * @param message Error message used when the property is geometric.
 * @returns The matching non-geometric property metadata.
 */
export function resolveNonGeometryProperty(featureType: GpfFeatureType, propertyName: string, message: string) {
  const property = Object.hasOwn(featureType.schema.properties, propertyName) ? featureType.schema.properties[propertyName] : undefined;
  if (!property) {
    const nonGeometryProperties = (Object.entries(featureType.schema.properties))
      .filter(([_propertyName, property]) => Boolean((property as OgcCollectionProperty).type))
      .map(([propertyName]) => propertyName);
    throw new Error(
      `La propriété '${propertyName}' n'existe pas pour '${featureType.typename}'. ` +
      `Propriétés non géométriques disponibles : ${nonGeometryProperties.join(", ")}. ` +
      `Appelle \`gpf_describe_type\` pour obtenir la signification de ces propriétés.`,
    );
  }
  if (!property.type) { // identifies a geometric property
    throw new Error(`La propriété '${propertyName}' est géométrique. ` + message);
  }
  return property;
}

// --- Select Validation ---

/**
 * Validates a selected property name and returns the exact property name to expose.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param propertyName Raw selected property name.
 * @returns The validated non-geometric property name.
 */
export function validateSelectProperty(featureType: GpfFeatureType, propertyName: string) {
  resolveNonGeometryProperty(
    featureType,
    propertyName,
    "`select` accepte uniquement des propriétés non géométriques."
  );
  return propertyName;
}

// --- Spatial Extras Validation ---

function validateSpatialExtras(featureType: GpfFeatureType, geometryName: string, spatial_extras?: SpatialExtraOptions[]) {
  if (!spatial_extras) {
    return;
  }
  const geometryType = getGeometryType(featureType, geometryName);
  const dimensionName = getGeometryTypeDimension(geometryType)
  if (geometryType == "Point" && spatial_extras.includes("bbox")) {
    const errorEnding = spatial_extras.includes("centroid") ?
      "ce qui est redondant avec le calcul du `centroid`, aussi demandé" :
      ": pour avoir cette information, demandez à la place le calcul du `centroid`."
    throw new Error(`La géométrie de l'objet sera de type Point, or vous avez demandé sa \`bbox\` ${errorEnding}. Retirez \`bbox\` de spatial_extras.`)
  }
  // `intersection_area` is only reachable from the get-features path:
  // `GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS` excludes it, so the by-id path never
  // sees it here.
  for (const { required, extras } of [
    { required: "linéaire", extras: ["length"] },
    { required: "surfacique", extras: ["area", "intersection_area"] },
  ]) {
    if (dimensionName != required && dimensionName != "?") {
      const faultyExtra = spatial_extras.filter(x => extras.includes(x));
      if (faultyExtra.length > 0) {
        throw new Error(`\`${faultyExtra[0]}\` ne peut être calculé que sur une géométrie ${required}, or la géométrie renvoyée sera ${dimensionName}. Retirez \`${faultyExtra[0]}\` de spatial_extras.`);
      }
    }
  }
}

// --- Property Selection ---

/**
 * Builds the list of property names to return according to `select` and `spatial_extras`.
 *
 * Note that:
 * - when `select` is omitted, every non-geometric property is returned
 * - when `select` is provided, each property is validated against the embedded catalog
 * - when `spatial_extras` is non-empty, the geometry column is appended so elements of GPF_GET_FEATURES_SPATIAL_EXTRAS (bbox, centroid, ...) can be derived
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param select The list of selected non-geometric properties.
 * @param spatial_extras The list of selected extra properties to compute on the geometry.
 * @param geometryName Geometry property name already resolved for the feature type.
 * @param includeGeometry Override boolean to force including the geometry in the return query.
 * @returns The list of property names to expose in the WFS `propertyName` parameter.
 */
export function buildPropertyName(
  featureType: GpfFeatureType,
  select?: string[],
  spatial_extras?: SpatialExtraOptions[],
  geometryName?: string,
  includeGeometry: boolean = (spatial_extras ?? []).length > 0,
) : string {

  // If `select` is specified, only the requested properties are returned
  // after validation against the embedded catalog.
  if (select && select.length > 0) {
    const selectedProperties = select.map((propertyName) =>
      validateSelectProperty(featureType, propertyName),
    );

    if (includeGeometry) {
      geometryName = geometryName ?? getGeometryName(featureType);
      validateSpatialExtras(featureType, geometryName, spatial_extras);
      return [...selectedProperties, geometryName].join(",");
    }

    return selectedProperties.join(",");
  }

  // If `select` is omitted, return every non-geometric property from the
  // feature type, appending the geometry column only when it is required,
  // for example when `spatial_extras` needs it to derive bbox/centroid/...
  
  if (includeGeometry) {
    // Ensure that the geometric property exists and is unique.
    geometryName = geometryName ?? getGeometryName(featureType);
    validateSpatialExtras(featureType, geometryName, spatial_extras);
    return (Object.entries(featureType.schema.properties))
      .map(([propertyName]) => propertyName)
      .join(","); // return all properties
  }

  const nonGeometryProperties = (Object.entries(featureType.schema.properties))
    .filter(([_propertyName, property]) => Boolean((property as OgcCollectionProperty).type))
    .map(([propertyName]) => propertyName);

  return nonGeometryProperties.join(",");
}

/**  
 * `buildPropertyName` for cartographic callers: the geometry column is always  
 * selected, and a geometry-less type must fail here rather than at map load.  
 */
export function buildPropertyNameWithGeometry(
  featureType: GpfFeatureType,
  select?: string[],
  geometryName: string = getGeometryName(featureType),
) {
  return buildPropertyName(featureType, select, [], geometryName, true);
}
