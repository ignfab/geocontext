/**
 * Query preparation helpers for the structured WFS engine.
 *
 * This module centralizes:
 * - compilation of attribute clauses into CQL fragments
 * - compilation of spatial filters into CQL fragments
 * - assembly of query parts used by WFS request builders
 * - a small façade over lower-level helpers reused elsewhere in the engine
 */

import type { OgcCollectionSchema, OgcCollectionProperty } from "@ignfab/gpf-schema-store";

import {
  buildSelectList,
  resolveNonGeometryProperty,
  getGeometryName,
} from "./properties.js";
import { getSpatialFilter } from "./spatialFilter.js";

import type {
  GpfQueryFeaturesInput,
  OrderByClause,
  WhereClause,
} from "./schema.js";
import { GPF_SPATIAL_FILTER_DOCNAMES } from "./schema.js"

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
  compileIntersectsPointSpatialFilter,
} from "./spatialCql.js";

// --- Re-exports ---

export { geometryToEwkt } from "./geometry.js";
export { validateSelectProperty, getGeometryName } from "./properties.js";
export { getSpatialFilter } from "./spatialFilter.js";

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

export type ResolvedFeatureGeometryRef = {
  geometry_ewkt: string;
};

export type CompiledQuery = {
  geometryName: string;
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
  property: OgcCollectionProperty,
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
  property: OgcCollectionProperty,
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
function compileInClause(property: OgcCollectionProperty, clause: InClause) {
  return `${property.name} IN (${clause.values.map(formatScalarValue).join(", ")})`;
}

/**
 * Compiles a normalized `is_null` clause into a CQL fragment.
 *
 * @param property Non-geometric property targeted by the clause.
 * @returns A CQL predicate fragment.
 */
function compileIsNullClause(property: OgcCollectionProperty) {
  return `${property.name} IS NULL`;
}

/**
 * Compiles a structured where clause into a CQL fragment.
 *
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param clause Raw where clause received from the tool input.
 * @returns A CQL predicate fragment.
 */
function compileWhereClause(featureType: OgcCollectionSchema, clause: WhereClause) {
  const property = resolveNonGeometryProperty(
    featureType,
    clause.property,
    `Utiliser un filtre spatial dédié (${GPF_SPATIAL_FILTER_DOCNAMES}).`
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
 * @param clause Raw order-by clause received from the tool input.
 * @returns A WFS `sortBy` fragment.
 */
function compileOrderByClause(featureType: OgcCollectionSchema, clause: OrderByClause) {
  resolveNonGeometryProperty(
    featureType,
    clause.property,
    "Utiliser une propriété non géométrique pour `order_by`."
  );
  return `${clause.property} ${ORDER_DIRECTION_TO_WFS[clause.direction]}`;
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
  input: GpfQueryFeaturesInput,
  featureType: OgcCollectionSchema,
  resolvedGeometryRef?: ResolvedFeatureGeometryRef,
): CompiledQuery {
  const geometryName = getGeometryName(featureType);
  const spatialFilter = getSpatialFilter(input);
  const fragments: string[] = [];

  // Keep the spatial predicate first: the GeoPlateforme GeoServer is sensitive
  // to filter ordering and may reject equivalent filters when attributes come first.
  if (spatialFilter) {
    switch (spatialFilter.operator) {
      case "bbox":
        fragments.push(compileBboxSpatialFilter(geometryName, spatialFilter));
        break;
      case "intersects_point":
        fragments.push(compileIntersectsPointSpatialFilter(geometryName, spatialFilter));
        break;
      case "dwithin_point":
        fragments.push(compileDwithinSpatialFilter(geometryName, spatialFilter));
        break;
      case "intersects_feature":
        if (!resolvedGeometryRef) {
          throw new Error("Le filtre spatial `intersects_feature` exige la résolution préalable de la géométrie de référence.");
        }
        fragments.push(compileIntersectsFeatureSpatialFilter(geometryName, resolvedGeometryRef.geometry_ewkt));
        break;
      case "travel_time":
        if (!resolvedGeometryRef) {
          throw new Error("Le filtre spatial `travel_time` exige la résolution préalable de la géométrie d'isochrone.");
        }
        fragments.push(compileIntersectsFeatureSpatialFilter(geometryName, resolvedGeometryRef.geometry_ewkt));
        break;
    }
  }

  for (const clause of input.where ?? []) {
    fragments.push(compileWhereClause(featureType, clause));
  }

  const isGetFeaturesQuery = "limit" in input;

  const sortBy = isGetFeaturesQuery && input.order_by && input.order_by.length > 0
    ? input.order_by.map((clause) => compileOrderByClause(featureType, clause)).join(",")
    : undefined;

  const propertyNames = isGetFeaturesQuery ? buildSelectList(featureType, input) : [];

  return {
    geometryName,
    cqlFilter: fragments.length > 0 ? fragments.join(" AND ") : undefined,
    propertyName: propertyNames.length > 0 ? propertyNames.join(",") : undefined,
    sortBy,
  };
}
