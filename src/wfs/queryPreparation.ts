/**
 * Query preparation helpers for the structured WFS engine.
 *
 * This module centralizes:
 * - compilation of attribute clauses into CQL fragments
 * - compilation of spatial filters into CQL fragments
 * - assembly of query parts used by WFS request builders
 * - a small façade over lower-level helpers reused elsewhere in the engine
 */

import type { Collection, CollectionProperty } from "@ignfab/gpf-schema-store";

import {
  validateSelectProperty,
  buildSelectList,
  resolveNonGeometryProperty,
  getGeometryProperty,
} from "./properties.js";
import { getSpatialFilter } from "./spatialFilter.js";

import type {
  GpfQueryFeaturesInput,
  OrderByClause,
  WhereClause,
} from "./schema.js";

import {
  formatScalarValue,
  normalizeWhereClause,
  SCALAR_COMPARISON_OPERATORS,
  NUMERIC_COMPARISON_OPERATORS,
} from "./attributeFilter.js";

import {
  compileBboxSpatialFilter,
  compileDwithinSpatialFilter,
  compileIntersectsFeatureSpatialFilter,
  compileAdjacentFeatureSpatialFilter,
  compileIntersectsPointSpatialFilter,
  type GeometryLike,
} from "./spatialCql.js";

// --- Re-exports ---

export { validateSelectProperty, getGeometryProperty } from "./properties.js";
export { getSpatialFilter } from "./spatialFilter.js";
export type { GeometryLike } from "./spatialCql.js";

// --- Internal Constants ---

const ORDER_DIRECTION_TO_WFS = {
  asc: "A",
  desc: "D",
} as const;

// --- Internal Clause Types ---

type ScalarComparisonClause = Extract<ReturnType<typeof normalizeWhereClause>, { operator: "eq" | "ne" }>;
type OrderedComparisonClause = Extract<ReturnType<typeof normalizeWhereClause>, { operator: "lt" | "lte" | "gt" | "gte" }>;
type InClause = Extract<ReturnType<typeof normalizeWhereClause>, { operator: "in" }>;

// --- Public Types ---

export type CompiledQuery = {
  geometryProperty: CollectionProperty;
  cqlFilter?: string;
  propertyName?: string;
  sortBy?: string;
};

// --- Attribute Compilation ---

/**
 * Compiles a normalized scalar comparison (`eq` / `ne`) into a CQL fragment.
 *
 * @param property Non-geometric property targeted by the clause.
 * @param clause Normalized scalar comparison clause.
 * @returns A CQL predicate fragment.
 */
function compileScalarComparisonClause(
  property: CollectionProperty,
  clause: ScalarComparisonClause,
) {
  return `${property.name} ${SCALAR_COMPARISON_OPERATORS[clause.operator]} ${formatScalarValue(clause.value)}`;
}

/**
 * Compiles a normalized ordered comparison (`lt` / `lte` / `gt` / `gte`) into a CQL fragment.
 *
 * @param property Non-geometric property targeted by the clause.
 * @param clause Normalized ordered comparison clause.
 * @returns A CQL predicate fragment.
 */
function compileOrderedComparisonClause(
  property: CollectionProperty,
  clause: OrderedComparisonClause,
) {
  return `${property.name} ${NUMERIC_COMPARISON_OPERATORS[clause.operator]} ${formatScalarValue(clause.value)}`;
}

/**
 * Compiles a normalized `in` clause into a CQL fragment.
 *
 * @param property Non-geometric property targeted by the clause.
 * @param clause Normalized `in` clause.
 * @returns A CQL predicate fragment.
 */
function compileInClause(property: CollectionProperty, clause: InClause) {
  return `${property.name} IN (${clause.values.map(formatScalarValue).join(", ")})`;
}

/**
 * Compiles a normalized `is_null` clause into a CQL fragment.
 *
 * @param property Non-geometric property targeted by the clause.
 * @returns A CQL predicate fragment.
 */
function compileIsNullClause(property: CollectionProperty) {
  return `${property.name} IS NULL`;
}

/**
 * Compiles a structured where clause into a CQL fragment.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param clause Raw where clause received from the tool input.
 * @returns A CQL predicate fragment.
 */
function compileWhereClause(featureType: Collection, geometryProperty: CollectionProperty, clause: WhereClause) {
  const property = resolveNonGeometryProperty(
    featureType,
    geometryProperty,
    clause.property,
    "La propriété '{property}' est géométrique. Utiliser un filtre spatial dédié (`bbox_filter`, `intersects_point_filter`, `dwithin_point_filter`, `intersects_feature_filter`, `adjacent_feature_filter` ou `travel_time_filter`)."
  );
  const normalized = normalizeWhereClause(property, clause);

  switch (normalized.operator) {
    case "eq":
    case "ne":
      return compileScalarComparisonClause(property, normalized);
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return compileOrderedComparisonClause(property, normalized);
    case "in":
      return compileInClause(property, normalized);
    case "is_null":
      return compileIsNullClause(property);
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
  const property = resolveNonGeometryProperty(
    featureType,
    geometryProperty,
    clause.property,
    "La propriété '{property}' est géométrique. Utiliser une propriété non géométrique pour `order_by`."
  );
  return `${property.name} ${ORDER_DIRECTION_TO_WFS[clause.direction]}`;
}

// --- Query Compilation ---

function resolvedGeometry(
  operator : string,
  geometryKind: string,
  resolvedGeometryRef? : GeometryLike,
) : GeometryLike {
  if (!resolvedGeometryRef) {
    throw new Error(`Le filtre spatial \`${operator}\` exige la résolution préalable de la géométrie ${geometryKind}.`);
  }
  return resolvedGeometryRef
}

/**
 * Compiles normalized tool input into query fragments ready to be turned into a WFS request.
 *
 * @param input Normalized tool input.
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param resolvedGeometryRef Optional resolved reference geometry for `intersects_feature` and `adjacent_feature`.
 * @returns Compiled query parts used by request builders.
 */
export function compileQueryParts(
  input: GpfQueryFeaturesInput,
  featureType: Collection,
  resolvedGeometryRef?: GeometryLike,
): CompiledQuery {
  const geometryProperty = getGeometryProperty(featureType);
  const spatialFilter = getSpatialFilter(input);
  const fragments: string[] = [];
  let resolved : GeometryLike;

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
        resolved = resolvedGeometry(spatialFilter.operator, "de référence", resolvedGeometryRef)
        fragments.push(compileIntersectsFeatureSpatialFilter(geometryProperty, resolved));
        break;
      case "adjacent_feature":
        resolved = resolvedGeometry(spatialFilter.operator, "de référence", resolvedGeometryRef)
        fragments.push(compileAdjacentFeatureSpatialFilter(geometryProperty, resolved));
        break;
      case "travel_time":
        resolved = resolvedGeometry(spatialFilter.operator, "d'isochrone", resolvedGeometryRef)
        fragments.push(compileIntersectsFeatureSpatialFilter(geometryProperty, resolved));
        break;
    }
  }

  for (const clause of input.where ?? []) {
    fragments.push(compileWhereClause(featureType, geometryProperty, clause));
  }

  const isGetFeaturesQuery = "limit" in input;

  const sortBy = isGetFeaturesQuery && input.order_by && input.order_by.length > 0
    ? input.order_by.map((clause) => compileOrderByClause(featureType, geometryProperty, clause)).join(",")
    : undefined;

  const propertyNames = isGetFeaturesQuery ? buildSelectList(featureType, geometryProperty, input) : [];

  return {
    geometryProperty,
    cqlFilter: fragments.length > 0 ? fragments.join(" AND ") : undefined,
    propertyName: propertyNames.length > 0 ? propertyNames.join(",") : undefined,
    sortBy,
  };
}
