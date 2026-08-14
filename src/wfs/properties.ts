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
import type { Geometry } from "geojson";
import { GPF_GET_FEATURES_SPATIAL_EXTRAS, type SpatialExtraOptions } from "./schema.js";

// --- Geometry Resolution ---

/**
 * Returns every geometry-like property exposed by a feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The list of spatial properties.
 */
export function getGeometryProperties(featureType: GpfFeatureType) {
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
    case "GeometryCollection": return "?"; // skip dimension checks when the geometry type is unknown
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
    // A spatial extra name is a likely mix-up (e.g. `order_by: area`): say what it is.
    const spatialExtraHint = (GPF_GET_FEATURES_SPATIAL_EXTRAS as readonly string[]).includes(propertyName)
      ? ` \`${propertyName}\` désigne un élément calculé via \`spatial_extras\`, pas une propriété du type : il n'est utilisable ni dans \`select\`, ni dans \`where\`, ni dans \`order_by\`.`
      : "";
    throw new Error(
      `La propriété '${propertyName}' n'existe pas pour '${featureType.typename}'.${spatialExtraHint} ` +
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

/** Formats extra names for an error message: "`a`", "`a` et `b`", "`a`, `b` et `c`". */
function formatExtraNames(extras: readonly string[]) {
  return extras
    .map((extra) => `\`${extra}\``)
    .join(", ")
    .replace(/, ([^,]*)$/, " et $1");
}

export function validateSpatialExtras(featureType: GpfFeatureType, geometryName: string, spatial_extras?: SpatialExtraOptions[]) {
  // Nothing to validate without extras: do not read the geometry format, which
  // cartographic callers (always `[]`) never need.
  if (!spatial_extras?.length) {
    return;
  }
  const geometryType = getGeometryType(featureType, geometryName);
  const dimensionName = getGeometryTypeDimension(geometryType)
  // Every incompatibility is collected, so that a single error lists all the
  // extras to remove instead of one per call.
  const problems: string[] = [];
  const faultyExtras: SpatialExtraOptions[] = [];
  if (geometryType == "Point" && spatial_extras.includes("bbox")) {
    const errorEnding = spatial_extras.includes("centroid") ?
      ", ce qui est redondant avec le calcul du `centroid`, aussi demandé" :
      " : pour avoir cette information, demandez à la place le calcul du `centroid`"
    problems.push(`La géométrie renvoyée sera de type Point, or vous avez demandé sa \`bbox\`${errorEnding}`);
    faultyExtras.push("bbox");
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
        const verb = faultyExtra.length > 1 ? "ne peuvent être calculés" : "ne peut être calculé";
        problems.push(`${formatExtraNames(faultyExtra)} ${verb} que sur une géométrie ${required}, or la géométrie renvoyée sera ${dimensionName}`);
        faultyExtras.push(...faultyExtra);
      }
    }
  }
  if (problems.length > 0) {
    // Listed in the order of the request.
    const extrasToRemove = spatial_extras.filter((extra) => faultyExtras.includes(extra));
    throw new Error(`${problems.join(". ")}. Retirez ${formatExtraNames(extrasToRemove)} de spatial_extras.`);
  }
}

/** True for a Point, or for a MultiPoint whose positions are all the same. */
function isSinglePosition(geometry: Geometry) {
  if (geometry.type === "Point") {
    return true;
  }
  if (geometry.type !== "MultiPoint" || geometry.coordinates.length === 0) {
    return false;
  }
  const [x, y] = geometry.coordinates[0];
  return geometry.coordinates.every(([px, py]) => px === x && py === y);
}

/**
 * Rejects the extras that the `intersects_feature_filter` reference makes
 * impossible (`intersection_area` needs an areal reference) or trivial
 * (`distance_to_filter_center` is always 0 from a single position).
 *
 * Called with the reference's catalog feature type before it is fetched, then
 * with its fetched geometry, which alone settles a `geometry-any` type or a
 * MultiPoint reduced to a single position.
 */
export function validateReferenceSpatialExtras(reference: GpfFeatureType | Geometry, spatial_extras: SpatialExtraOptions[]) {
  if (spatial_extras.length === 0) {
    return;
  }
  const isFeatureType = "schema" in reference;
  const geometryType = isFeatureType ? getGeometryType(reference, getGeometryName(reference)) : reference.type;
  const dimensionName = getGeometryTypeDimension(geometryType);
  const problems: string[] = [];
  const faultyExtras: SpatialExtraOptions[] = [];
  if (spatial_extras.includes("intersection_area") && dimensionName != "surfacique" && dimensionName != "?") {
    problems.push(`\`intersection_area\` ne peut pas être calculé avec une référence ${dimensionName} dans \`intersects_feature_filter\`, car elle n'a pas de surface : choisissez une référence surfacique`);
    faultyExtras.push("intersection_area");
  }
  if (spatial_extras.includes("distance_to_filter_center") && (isFeatureType ? geometryType == "Point" : isSinglePosition(reference))) {
    problems.push("`distance_to_filter_center` vaut toujours 0 avec une référence réduite à un point dans `intersects_feature_filter`, puisque chaque objet renvoyé contient ce point : pour classer des objets selon leur distance à un point, utilisez plutôt `dwithin_point_filter`");
    faultyExtras.push("distance_to_filter_center");
  }
  if (problems.length > 0) {
    const extrasToRemove = spatial_extras.filter((extra) => faultyExtras.includes(extra));
    throw new Error(`${problems.join(". ")}. Sinon, retirez ${formatExtraNames(extrasToRemove)} de spatial_extras.`);
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
