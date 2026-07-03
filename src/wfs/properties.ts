/**
 * Property resolution and validation helpers for the structured WFS query compiler.
 *
 * This module centralizes:
 * - geometry property lookup
 * - property existence checks
 * - non-geometry validation for select/order/filter compilation
 */

import type { Collection, CollectionProperty } from "@ignfab/gpf-schema-store";
import type { GpfGetFeaturesInput } from "./schema.js";

// --- Property Listing ---

/**
 * Lists available property names for a feature type, mainly for error reporting.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns A comma-separated list of property names.
 */
function getPropertyList(featureType: Collection) {
  return featureType.properties.map((property: CollectionProperty) => property.name).join(", ");
}

// --- Geometry Resolution ---

/**
 * Returns every geometry-like property exposed by a feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The list of properties carrying a `defaultCrs`.
 */
function getGeometryProperties(featureType: Collection) {
  return featureType.properties.filter((property: CollectionProperty) => property.defaultCrs);
}

/**
 * Resolves the single geometry property expected by the query compiler.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The unique geometry property for the feature type.
 */
export function getGeometryProperty(featureType: Collection) {
  const geometryProperties = getGeometryProperties(featureType);
  if (geometryProperties.length === 0) {
    throw new Error(`Le type '${featureType.id}' n'expose aucune propriété géométrique exploitable dans le catalogue embarqué.`);
  }
  if (geometryProperties.length > 1) {
    throw new Error(`Le type '${featureType.id}' expose plusieurs propriétés géométriques dans le catalogue embarqué : ${geometryProperties.map((property: CollectionProperty) => property.name).join(", ")}.`);
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
function getPropertyOrThrow(featureType: Collection, propertyName: string) {
  const property = featureType.properties.find((candidate: CollectionProperty) => candidate.name === propertyName);
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
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param propertyName Exact property name requested by the caller.
 * @param message Error message template used when the property is geometric.
 * @returns The matching non-geometric property metadata.
 */
export function resolveNonGeometryProperty(featureType: Collection, geometryProperty: CollectionProperty, propertyName: string, message: string) {
  const property = getPropertyOrThrow(featureType, propertyName);
  if (property.name === geometryProperty.name || property.defaultCrs) {
    throw new Error(message.replace("{property}", property.name));
  }
  return property;
}

// --- Select Validation ---

/**
 * Validates a selected property name and returns the exact property name to expose.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param propertyName Raw selected property name.
 * @returns The validated non-geometric property name.
 */
export function validateSelectProperty(featureType: Collection, geometryProperty: CollectionProperty, propertyName: string) {
  return resolveNonGeometryProperty(
    featureType,
    geometryProperty,
    propertyName,
    "La propriété '{property}' est géométrique. `select` accepte uniquement des propriétés non géométriques."
  ).name;
}

// --- Property Selection ---

/**
 * Builds the list of property names to return according to `select`.
 *
 * Note that:
 * - when `select` is omitted, every non-geometric property is returned
 * - when `select` is provided, each property is validated against the embedded catalog
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param input Normalized tool input.
 * @returns The list of property names to expose in the WFS `propertyName` parameter, and the same list including the geometry
 */
export function buildSelectList(
  featureType: Collection,
  geometryProperty: CollectionProperty,
  input: GpfGetFeaturesInput,
) {
  const shouldIncludeGeometry = (input.spatial_extras ?? []).length > 0;
  const hasExplicitSelect = Boolean(input.select && input.select.length > 0);
  const baseSelection = hasExplicitSelect
    ? input.select!.map((propertyName) =>
      validateSelectProperty(featureType, geometryProperty, propertyName),
    )
    : featureType.properties
      .filter((property: CollectionProperty) => !property.defaultCrs)
      .map((property: CollectionProperty) => property.name);

  const selection = shouldIncludeGeometry
    ? [...baseSelection, geometryProperty.name]
    : baseSelection;

  const withGeometry = hasExplicitSelect || shouldIncludeGeometry
    ? [...baseSelection, geometryProperty.name]
    : []; // empty list means include everything

  return {
    selection,
    withGeometry,
  };
}
