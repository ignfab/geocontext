// --- Imports ---

import type { Collection, CollectionProperty } from "@ignfab/gpf-schema-store";

import type {
  GpfWfsGetFeaturesInput,
  OrderByClause,
  SpatialFilter,
  WhereClause,
} from "./schema.js";

// --- Local Types ---

type ScalarValue = string | number | boolean;
type NormalizedWhereClause =
  | { property: string; operator: "eq" | "ne"; value: ScalarValue }
  | { property: string; operator: "lt" | "lte" | "gt" | "gte"; value: number | string }
  | { property: string; operator: "in"; values: ScalarValue[] }
  | { property: string; operator: "is_null" };

// --- Constants ---

const SCALAR_COMPARISON_OPERATORS = {
  eq: "=",
  ne: "<>",
} as const;

const NUMERIC_COMPARISON_OPERATORS = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
} as const;

const ORDER_DIRECTION_TO_WFS = {
  asc: "A",
  desc: "D",
} as const;

const BBOX_PARAM_NAMES = ["bbox_west", "bbox_south", "bbox_east", "bbox_north"] as const;
const INTERSECTS_POINT_PARAM_NAMES = ["intersects_lon", "intersects_lat"] as const;
const DWITHIN_PARAM_NAMES = ["dwithin_lon", "dwithin_lat", "dwithin_distance_m"] as const;
const INTERSECTS_FEATURE_PARAM_NAMES = ["intersects_feature_typename", "intersects_feature_id"] as const;

export type ResolvedFeatureGeometryRef = {
  typename: string;
  feature_id: string;
  geometry_ewkt: string;
};

export type CompiledQuery = {
  geometryProperty: CollectionProperty;
  cqlFilter?: string;
  propertyName?: string;
  sortBy?: string;
};

// --- Property Helpers ---

/**
 * Lists available property names for a feature type, mainly for error reporting.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns A comma-separated list of property names.
 */
function getPropertyList(featureType: Collection) {
  return featureType.properties.map((property) => property.name).join(", ");
}

/**
 * Escapes a string literal so it can be embedded safely in a CQL string value.
 *
 * @param value Raw string value.
 * @returns The escaped string value.
 */
function escapeStringLiteral(value: string) {
  return value.replace(/'/g, "''");
}

/**
 * Formats a scalar value as a CQL literal.
 *
 * @param value Scalar value already normalized for its target property.
 * @returns A CQL-ready literal representation.
 */
function formatScalarValue(value: ScalarValue) {
  if (typeof value === "string") {
    return `'${escapeStringLiteral(value)}'`;
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value);
}

//TODO : this is not really robust
/**
 * Checks whether a property should be treated as boolean for value coercion.
 *
 * @param property Property metadata from the embedded catalog.
 * @returns `true` when the property type is recognized as boolean-like.
 */
function isBooleanProperty(property: CollectionProperty) {
  return ["boolean", "bool"].includes(property.type.toLowerCase());
}

/**
 * Checks whether a property should be treated as an integer for value coercion.
 *
 * @param property Property metadata from the embedded catalog.
 * @returns `true` when the property type is recognized as integer-like.
 */
function isIntegerProperty(property: CollectionProperty) {
  return ["integer", "long", "short"].includes(property.type.toLowerCase());
}

/**
 * Checks whether a property should be treated as numeric for value coercion.
 *
 * @param property Property metadata from the embedded catalog.
 * @returns `true` when the property type is recognized as numeric-like.
 */
function isNumericProperty(property: CollectionProperty) {
  return ["integer", "number", "float", "double", "decimal", "long", "short", "numeric"].includes(property.type.toLowerCase());
}

/**
 * Checks whether a property should be treated as a date for value coercion.
 *
 * @param property Property metadata from the embedded catalog.
 * @returns `true` when the property type or name suggests a date-like value.
 */
function isDateProperty(property: CollectionProperty) {
  const type = property.type.toLowerCase();
  return ["date", "datetime", "timestamp", "timestamptz"].includes(type) || property.name.startsWith("date_");
}

/**
 * Parses a serialized numeric value and rejects non-finite numbers.
 *
 * @param value Serialized numeric value.
 * @param message Error message to throw when parsing fails.
 * @returns The parsed numeric value.
 */
function parseNumericString(value: string, message: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(message);
  }
  return parsed;
}

/**
 * Parses a serialized integer value and rejects non-integer numbers.
 *
 * @param value Serialized integer value.
 * @param message Error message to throw when parsing fails.
 * @returns The parsed integer value.
 */
function parseIntegerString(value: string, message: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(message);
  }
  return parsed;
}

/**
 * Validates a serialized date value using JavaScript date parsing.
 *
 * @param value Serialized date value.
 * @param message Error message to throw when parsing fails.
 * @returns The original value once validated.
 */
function parseDateString(value: string, message: string) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(message);
  }
  return value;
}

/**
 * Parses a serialized boolean value accepted by the tool contract.
 *
 * @param value Serialized boolean value.
 * @param message Error message to throw when parsing fails.
 * @returns The parsed boolean value.
 */
function parseBooleanString(value: string, message: string) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(message);
}

/**
 * Returns every geometry-like property exposed by a feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @returns The list of properties carrying a `defaultCrs`.
 */
function getGeometryProperties(featureType: Collection) {
  return featureType.properties.filter((property) => property.defaultCrs);
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
    throw new Error(`Le type '${featureType.id}' expose plusieurs propriétés géométriques dans le catalogue embarqué : ${geometryProperties.map((property) => property.name).join(", ")}.`);
  }
  return geometryProperties[0];
}

/**
 * Loads a property by exact name and throws a descriptive error when it does not exist.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param propertyName Exact property name requested by the caller.
 * @returns The matching property metadata.
 */
function getPropertyOrThrow(featureType: Collection, propertyName: string) {
  const property = featureType.properties.find((candidate) => candidate.name === propertyName);
  if (!property) {
    throw new Error(`La propriété '${propertyName}' n'existe pas pour '${featureType.id}'. Utiliser une propriété parmi : ${getPropertyList(featureType)}.`);
  }
  return property;
}

/**
 * Ensures that a property exists and is not the geometry column of the feature type.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param propertyName Exact property name requested by the caller.
 * @param message Error message template used when the property is geometric.
 * @returns The matching non-geometric property metadata.
 */
function ensureNonGeometryProperty(featureType: Collection, geometryProperty: CollectionProperty, propertyName: string, message: string) {
  const property = getPropertyOrThrow(featureType, propertyName);
  if (property.name === geometryProperty.name || property.defaultCrs) {
    throw new Error(message.replace("{property}", property.name));
  }
  return property;
}

/**
 * Extracts the single serialized value required by operators such as `eq` or `gt`.
 *
 * @param filter Raw where clause.
 * @param message Error message to throw when the clause shape is invalid.
 * @returns The serialized scalar value carried by the clause.
 */
function getSingleStringValue(filter: WhereClause, message: string) {
  if (typeof filter.value !== "string" || filter.values !== undefined) {
    throw new Error(message);
  }
  return filter.value;
}

// --- Value Coercion ---

/**
 * Ensures that ordered comparison operators only target numeric-like or date-like properties.
 *
 * @param property Property metadata from the embedded catalog.
 * @param operator Ordered comparison operator being compiled.
 * @returns Nothing. Throws when the property type is incompatible with ordered comparisons.
 */
function ensureNumericProperty(property: CollectionProperty, operator: keyof typeof NUMERIC_COMPARISON_OPERATORS) {
  if (!isNumericProperty(property) && !isDateProperty(property)) {
    throw new Error(`L'opérateur '${operator}' n'est supporté que pour une propriété numérique ou de date. '${property.name}' est de type '${property.type}'.`);
  }
}

/**
 * Coerces a serialized scalar value according to the target property metadata.
 *
 * @param property Property metadata from the embedded catalog.
 * @param value Serialized scalar value received from the tool input.
 * @returns A normalized scalar value ready for CQL formatting.
 */
function coerceScalarValueForProperty(property: CollectionProperty, value: string) {
  if (isIntegerProperty(property)) {
    return parseIntegerString(value, `La propriété '${property.name}' exige une valeur entière sérialisée en texte.`);
  }
  if (isNumericProperty(property)) {
    return parseNumericString(value, `La propriété '${property.name}' exige une valeur numérique sérialisée en texte.`);
  }
  if (isBooleanProperty(property)) {
    return parseBooleanString(value, `La propriété '${property.name}' exige une valeur booléenne sérialisée en texte ('true' ou 'false').`);
  }
  if (isDateProperty(property)) {
    return parseDateString(value, `La propriété '${property.name}' exige une date sérialisée en texte valide.`);
  }
  if (Array.isArray(property.enum) && property.enum.length > 0 && !property.enum.includes(value)) {
    throw new Error(`La propriété '${property.name}' exige une valeur parmi : ${property.enum.join(", ")}.`);
  }
  return value;
}

/**
 * Coerces a serialized value used by ordered comparison operators.
 *
 * @param property Property metadata from the embedded catalog.
 * @param value Serialized scalar value received from the tool input.
 * @param operator Ordered comparison operator being compiled.
 * @returns A normalized date or numeric value ready for CQL formatting.
 */
function coerceOrderedValueForProperty(property: CollectionProperty, value: string, operator: keyof typeof NUMERIC_COMPARISON_OPERATORS) {
  ensureNumericProperty(property, operator);
  if (isDateProperty(property)) {
    return parseDateString(value, `L'opérateur '${operator}' exige une propriété \`value\` date valide.`);
  }
  if (isIntegerProperty(property)) {
    return parseIntegerString(value, `L'opérateur '${operator}' exige une propriété \`value\` entière.`);
  }
  return parseNumericString(value, `L'opérateur '${operator}' exige une propriété \`value\` numérique.`);
}

/**
 * Validates and normalizes a raw where clause into a shape that is easier to compile.
 *
 * @param property Property metadata targeted by the clause.
 * @param clause Raw where clause received from the tool input.
 * @returns A normalized where clause with coerced values.
 */
function normalizeWhereClause(property: CollectionProperty, clause: WhereClause): NormalizedWhereClause {
  switch (clause.operator) {
    case "eq":
    case "ne":
      return {
        property: clause.property,
        operator: clause.operator,
        value: coerceScalarValueForProperty(property, getSingleStringValue(clause, `L'opérateur '${clause.operator}' exige exactement une propriété \`value\`.`)),
      };
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return {
        property: clause.property,
        operator: clause.operator,
        value: coerceOrderedValueForProperty(property, getSingleStringValue(clause, `L'opérateur '${clause.operator}' exige exactement une propriété \`value\`.`), clause.operator),
      };
    case "in":
      if (clause.value !== undefined || !Array.isArray(clause.values) || clause.values.length === 0 || !clause.values.every((value) => typeof value === "string")) {
        throw new Error("L'opérateur 'in' exige une propriété `values` non vide.");
      }
      return {
        property: clause.property,
        operator: "in",
        values: clause.values.map((value) => coerceScalarValueForProperty(property, value)),
      };
    case "is_null":
      if (clause.value !== undefined || clause.values !== undefined) {
        throw new Error("L'opérateur 'is_null' n'accepte ni `value` ni `values`.");
      }
      return {
        property: clause.property,
        operator: "is_null",
      };
  }
}

// --- Attribute Compilation ---

/**
 * Compiles a structured where clause into a CQL fragment.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param clause Raw where clause received from the tool input.
 * @returns A CQL predicate fragment.
 */
function compileWhereClause(featureType: Collection, geometryProperty: CollectionProperty, clause: WhereClause) {
  const property = ensureNonGeometryProperty(
    featureType,
    geometryProperty,
    clause.property,
    "La propriété '{property}' est géométrique. Utiliser `spatial_operator` et ses paramètres dédiés."
  );
  const normalized = normalizeWhereClause(property, clause);

  switch (normalized.operator) {
    case "eq":
    case "ne":
      return `${property.name} ${SCALAR_COMPARISON_OPERATORS[normalized.operator]} ${formatScalarValue(normalized.value)}`;
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return `${property.name} ${NUMERIC_COMPARISON_OPERATORS[normalized.operator]} ${formatScalarValue(normalized.value)}`;
    case "in":
      return `${property.name} IN (${normalized.values.map(formatScalarValue).join(", ")})`;
    case "is_null":
      return `${property.name} IS NULL`;
  }
}

/**
 * Compiles a structured sort clause into a WFS `sortBy` fragment.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param clause Raw order-by clause received from the tool input.
 * @returns A WFS `sortBy` fragment.
 */
function compileOrderByClause(featureType: Collection, geometryProperty: CollectionProperty, clause: OrderByClause) {
  const property = ensureNonGeometryProperty(
    featureType,
    geometryProperty,
    clause.property,
    "La propriété '{property}' est géométrique. Utiliser une propriété non géométrique pour `order_by`."
  );
  return `${property.name} ${ORDER_DIRECTION_TO_WFS[clause.direction]}`;
}

/**
 * Validates a selected property name and returns the exact property name to expose.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param propertyName Raw selected property name.
 * @returns The validated non-geometric property name.
 */
function compileSelectProperty(featureType: Collection, geometryProperty: CollectionProperty, propertyName: string) {
  return ensureNonGeometryProperty(
    featureType,
    geometryProperty,
    propertyName,
    "La propriété '{property}' est géométrique. `select` accepte uniquement des propriétés non géométriques."
  ).name;
}

// --- Spatial Compilation ---

/**
 * Compiles a bbox spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized bbox filter.
 * @returns A CQL bbox predicate.
 */
function compileBboxSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "bbox" }>) {
  if (spatialFilter.west >= spatialFilter.east) {
    throw new Error("Le bbox est invalide : `bbox_west` doit être strictement inférieur à `bbox_east`.");
  }
  if (spatialFilter.south >= spatialFilter.north) {
    throw new Error("Le bbox est invalide : `bbox_south` doit être strictement inférieur à `bbox_north`.");
  }
  return `BBOX(${geometryProperty.name},${spatialFilter.west},${spatialFilter.south},${spatialFilter.east},${spatialFilter.north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
function compileIntersectsPointSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "intersects_point" }>) {
  return `INTERSECTS(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}))`;
}

/**
 * Compiles a distance-based spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized distance filter.
 * @returns A CQL dwithin predicate.
 */
function compileDwithinSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "dwithin_point" }>) {
  return `DWITHIN(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}),${spatialFilter.distance_m},meters)`;
}

/**
 * Compiles an `intersects_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param geometryEwkt Reference geometry serialized as EWKT.
 * @returns A CQL intersects predicate.
 */
function compileIntersectsFeatureSpatialFilter(geometryProperty: CollectionProperty, geometryEwkt: string) {
  return `INTERSECTS(${geometryProperty.name},${geometryEwkt})`;
}

// --- Geometry Serialization ---

/**
 * Serializes a GeoJSON-like geometry object into EWKT for CQL spatial predicates.
 *
 * @param geometry Geometry object exposing a GeoJSON `type` and `coordinates`.
 * @returns The EWKT representation of the geometry.
 */
export function geometryToEwkt(geometry: { type: string; coordinates: unknown }) {
  switch (geometry.type) {
    case "Point":
      return `SRID=4326;POINT(${positionToWkt(geometry.coordinates as [number, number])})`;
    case "MultiPoint":
      return `SRID=4326;MULTIPOINT(${(geometry.coordinates as [number, number][])
        .map((position) => `(${positionToWkt(position)})`)
        .join(",")})`;
    case "LineString":
      return `SRID=4326;LINESTRING(${(geometry.coordinates as [number, number][]).map(positionToWkt).join(",")})`;
    case "MultiLineString":
      return `SRID=4326;MULTILINESTRING(${(geometry.coordinates as [number, number][][]).map((line) => `(${line.map(positionToWkt).join(",")})`).join(",")})`;
    case "Polygon":
      return `SRID=4326;POLYGON(${(geometry.coordinates as [number, number][][]).map((ring) => `(${ring.map(positionToWkt).join(",")})`).join(",")})`;
    case "MultiPolygon":
      return `SRID=4326;MULTIPOLYGON(${(geometry.coordinates as [number, number][][][]).map((polygon) => `(${polygon.map((ring) => `(${ring.map(positionToWkt).join(",")})`).join(",")})`).join(",")})`;
    default:
      throw new Error(`Le type de géométrie '${geometry.type}' n'est pas supporté pour \`intersects_feature\`.`);
  }
}

/**
 * Serializes a single coordinate pair into a WKT position.
 *
 * @param position Coordinate pair expressed as `[lon, lat]`.
 * @returns A WKT position string.
 */
function positionToWkt(position: [number, number]) {
  return `${position[0]} ${position[1]}`;
}

// --- Spatial Input Normalization ---

/**
 * Checks whether any property in a named group is defined on the raw input object.
 *
 * @param input Normalized tool input.
 * @param keys Input keys to inspect.
 * @returns `true` when at least one key from the group is present.
 */
function hasAny(input: GpfWfsGetFeaturesInput, keys: readonly string[]) {
  return keys.some((name) => input[name as keyof GpfWfsGetFeaturesInput] !== undefined);
}

/**
 * Normalizes the raw spatial input into a discriminated spatial filter object.
 *
 * @param input Normalized tool input.
 * @returns A normalized spatial filter, or `undefined` when no spatial filter is requested.
 */
export function getSpatialFilter(input: GpfWfsGetFeaturesInput): SpatialFilter | undefined {
  const hasBboxParams = hasAny(input, BBOX_PARAM_NAMES);
  const hasIntersectsPointParams = hasAny(input, INTERSECTS_POINT_PARAM_NAMES);
  const hasDwithinParams = hasAny(input, DWITHIN_PARAM_NAMES);
  const hasIntersectsFeatureParams = hasAny(input, INTERSECTS_FEATURE_PARAM_NAMES);

  switch (input.spatial_operator) {
    case undefined:
      if (hasBboxParams || hasIntersectsPointParams || hasDwithinParams || hasIntersectsFeatureParams) {
        throw new Error("Les paramètres spatiaux exigent `spatial_operator`.");
      }
      return undefined;
    case "bbox":
      if (hasIntersectsPointParams || hasDwithinParams || hasIntersectsFeatureParams) {
        throw new Error("Le filtre spatial `bbox` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (input.bbox_west === undefined || input.bbox_south === undefined || input.bbox_east === undefined || input.bbox_north === undefined) {
        throw new Error("Le filtre spatial `bbox` exige `bbox_west`, `bbox_south`, `bbox_east` et `bbox_north`.");
      }
      return { operator: "bbox", west: input.bbox_west, south: input.bbox_south, east: input.bbox_east, north: input.bbox_north };
    case "intersects_point":
      if (hasBboxParams || hasDwithinParams || hasIntersectsFeatureParams) {
        throw new Error("Le filtre spatial `intersects_point` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (input.intersects_lon === undefined || input.intersects_lat === undefined) {
        throw new Error("Le filtre spatial `intersects_point` exige `intersects_lon` et `intersects_lat`.");
      }
      return { operator: "intersects_point", lon: input.intersects_lon, lat: input.intersects_lat };
    case "dwithin_point":
      if (hasBboxParams || hasIntersectsPointParams || hasIntersectsFeatureParams) {
        throw new Error("Le filtre spatial `dwithin_point` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (input.dwithin_lon === undefined || input.dwithin_lat === undefined || input.dwithin_distance_m === undefined) {
        throw new Error("Le filtre spatial `dwithin_point` exige `dwithin_lon`, `dwithin_lat` et `dwithin_distance_m`.");
      }
      return { operator: "dwithin_point", lon: input.dwithin_lon, lat: input.dwithin_lat, distance_m: input.dwithin_distance_m };
    case "intersects_feature":
      if (hasBboxParams || hasIntersectsPointParams || hasDwithinParams) {
        throw new Error("Le filtre spatial `intersects_feature` n'accepte pas les paramètres d'un autre mode spatial.");
      }
      if (!input.intersects_feature_typename || !input.intersects_feature_id) {
        throw new Error("Le filtre spatial `intersects_feature` exige `intersects_feature_typename` et `intersects_feature_id`.");
      }
      return { operator: "intersects_feature", typename: input.intersects_feature_typename, feature_id: input.intersects_feature_id };
  }
}

/**
 * Builds the list of non-geometric properties to request from the WFS layer.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param input Normalized tool input.
 * @returns The list of selected property names, or every non-geometric property when `select` is omitted.
 */
function buildSelectList(featureType: Collection, geometryProperty: CollectionProperty, input: GpfWfsGetFeaturesInput) {
  return input.select && input.select.length > 0
    ? input.select.map((propertyName) => compileSelectProperty(featureType, geometryProperty, propertyName))
    : featureType.properties
      .filter((property) => !property.defaultCrs)
      .map((property) => property.name);
}

// --- Query Compilation ---

/**
 * Compiles normalized tool input into query fragments ready to be turned into a WFS request.
 *
 * @param input Normalized tool input.
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param resolvedGeometryRef Optional resolved reference geometry for `intersects_feature`.
 * @returns Compiled query parts used by request builders.
 */
export function compileQueryParts(
  input: GpfWfsGetFeaturesInput,
  featureType: Collection,
  resolvedGeometryRef?: ResolvedFeatureGeometryRef
): CompiledQuery {
  const geometryProperty = getGeometryProperty(featureType);
  const spatialFilter = getSpatialFilter(input);
  const fragments: string[] = [];

  // Keep the spatial predicate first: the GeoPlateforme GeoServer is sensitive
  // to filter ordering and may reject equivalent filters when attributes come first.
  if (spatialFilter) {
    switch (spatialFilter.operator) {
      case "bbox":
        fragments.push(compileBboxSpatialFilter(geometryProperty, spatialFilter));
        break;
      case "intersects_point":
        fragments.push(compileIntersectsPointSpatialFilter(geometryProperty, spatialFilter));
        break;
      case "dwithin_point":
        fragments.push(compileDwithinSpatialFilter(geometryProperty, spatialFilter));
        break;
      case "intersects_feature":
        if (!resolvedGeometryRef) {
          throw new Error("Le filtre spatial `intersects_feature` exige la résolution préalable de la géométrie de référence.");
        }
        fragments.push(compileIntersectsFeatureSpatialFilter(geometryProperty, resolvedGeometryRef.geometry_ewkt));
        break;
    }
  }

  for (const clause of input.where ?? []) {
    fragments.push(compileWhereClause(featureType, geometryProperty, clause));
  }

  const sortBy = input.order_by && input.order_by.length > 0
    ? input.order_by.map((clause) => compileOrderByClause(featureType, geometryProperty, clause)).join(",")
    : undefined;

  const propertyNames = buildSelectList(featureType, geometryProperty, input);

  return {
    geometryProperty,
    cqlFilter: fragments.length > 0 ? fragments.join(" AND ") : undefined,
    propertyName: propertyNames.length > 0 ? propertyNames.join(",") : undefined,
    sortBy,
  };
}
