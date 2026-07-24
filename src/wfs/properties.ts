/**
 * Property resolution and validation helpers for the structured WFS query compiler.
 *
 * This module centralizes:
 * - geometry property lookup
 * - property existence checks
 * - non-geometry validation for select/order/filter compilation
 */

import type { OgcCollectionSchema, OgcCollectionProperty } from "@ignfab/gpf-schema-store";
import type { GpfGetFeaturesInput } from "./schema.js";

// --- Property Listing ---

/**
 * Lists available property names for a feature type, mainly for error reporting.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns A comma-separated list of property names.
 */
function getPropertyList(featureType: OgcCollectionSchema) {
  return featureType.properties.map((property: OgcCollectionProperty) => property.name).join(", ");
}

// --- Geometry Resolution ---

/**
 * Returns every geometry-like property exposed by a feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The list of properties carrying a `defaultCrs`.
 */
function getGeometryProperties(featureType: OgcCollectionSchema) {
  return featureType.properties.filter((property: OgcCollectionProperty) => property.defaultCrs);
}

/**
 * Resolves the single geometry property expected by the query compiler.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The unique geometry property for the feature type.
 */
export function getGeometryName(featureType: OgcCollectionSchema) : string {
  const geometryProperties = getGeometryProperties(featureType);
  if (geometryProperties.length === 0) {
    throw new Error(`Erreur du catalogue embarqué : la collection '${featureType.title}' n'expose aucune propriété géométrique exploitable.`);
  }
  if (geometryProperties.length > 1) {
    // TODO: should we silently return the unique property identified by "x-ogc-role": 'primary-geometry'?
    throw new Error(`La collection '${featureType.title}' expose plusieurs propriétés géométriques dans le catalogue embarqué : ${geometryProperties.join(", ")}.`);
  }
  return geometryProperties[0];
}

// --- Generic Property Resolution ---

/**
 * Loads a property by exact name and throws a descriptive error when it does not exist.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param propertyName Exact property name requested by the caller.
 * @returns The matching property metadata.
 */
function getPropertyOrThrow(featureType: OgcCollectionSchema, propertyName: string) {
  const property = featureType.properties.find((candidate: OgcCollectionProperty) => candidate.name === propertyName);
  if (!property) {
    throw new Error(
      `La propriété '${propertyName}' n'existe pas pour '${featureType.id}'. ` +
      `Appelle \`gpf_describe_type\` pour obtenir la liste des propriétés disponibles.`,
    );
  }
  return property;
}

// --- Non-Geometry Validation ---

/**
 * Resolves a property by exact name and ensures it is not the geometry column
 * of the feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param propertyName Exact property name requested by the caller.
 * @param message Error message template used when the property is geometric.
 * @returns The matching non-geometric property metadata.
 */
export function resolveNonGeometryProperty(featureType: OgcCollectionSchema, propertyName: string, message: string) {
  const property = getPropertyOrThrow(featureType, propertyName);
  if (!property.type) { // identifies a geometric property
    throw new Error(message.replace("{property}", property.title ?? propertyName));
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
export function validateSelectProperty(featureType: OgcCollectionSchema, propertyName: string) {
  return resolveNonGeometryProperty(
    featureType,
    propertyName,
    "La propriété '{property}' est géométrique. `select` accepte uniquement des propriétés non géométriques."
  ).name;
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
 * @param geometryName Geometry property name already resolved for the feature type.
 * @param input Normalized tool input.
 * @returns The list of property names to expose in the WFS `propertyName` parameter.
 */
export function buildSelectList(
  featureType: OgcCollectionSchema,
  input: GpfGetFeaturesInput,
) {
  const shouldIncludeGeometry = (input.spatial_extras ?? []).length > 0;
  const geometryName = shouldIncludeGeometry ? getGeometryName(featureType) : undefined;

  // If `select` is specified, only the requested properties are returned
  // after validation against the embedded catalog.
  if (input.select && input.select.length > 0) {
    const selectedProperties = input.select.map((propertyName) =>
      validateSelectProperty(featureType, propertyName),
    );

    // Include geometry when `spatial_extras` needs it to derive bbox/centroid/...
    if (shouldIncludeGeometry) {
      return [...selectedProperties, geometryName];
    }

    return selectedProperties;
  }

  // If `select` is omitted, return every non-geometric property from the
  // feature type, appending the geometry column only when `spatial_extras`
  // needs it.
  const nonGeometryProperties = featureType.properties
    .filter((property: OgcCollectionProperty) => !property.defaultCrs)
    .map((property: OgcCollectionProperty) => property.name);

  if (shouldIncludeGeometry) {
    return [...nonGeometryProperties, geometryName];
  }

  return nonGeometryProperties;
}
