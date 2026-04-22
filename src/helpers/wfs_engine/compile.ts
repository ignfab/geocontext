import type { Collection, CollectionProperty } from "@ignfab/gpf-schema-store";

import {
  compileSelectProperty,
  ensureNonGeometryProperty,
  getGeometryProperty,
} from "./properties.js";
import { getSpatialFilter } from "./spatial.js";

import type {
  GpfWfsGetFeaturesInput,
  OrderByClause,
  WhereClause,
} from "./schema.js";

import {
  formatScalarValue,
  normalizeWhereClause,
  SCALAR_COMPARISON_OPERATORS,
  NUMERIC_COMPARISON_OPERATORS,
} from "./where.js";

import {
  compileBboxSpatialFilter,
  compileDwithinSpatialFilter,
  compileIntersectsFeatureSpatialFilter,
  compileIntersectsPointSpatialFilter,
} from "./spatialCql.js";

export { geometryToEwkt } from "./geometry.js";
export { compileSelectProperty, getGeometryProperty } from "./properties.js";
export { getSpatialFilter } from "./spatial.js";

const ORDER_DIRECTION_TO_WFS = {
  asc: "A",
  desc: "D",
} as const;

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
 * Build the list of property names to return in the WFS response according to the `select` and `result_type` input parameters.
 *
 * Note that :
 * - When `select` is omitted and `result_type` is `results`, all non-geometric properties are returned.
 * - When `select` is provided, the specified properties are validated according to the featureType from the Catalog.
 * - When `result_type` is `request` and `select` is provided, the geometry column is automatically appended.
 *  
 * @param featureType Feature type definition loaded from the embedded catalog.
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param input Normalized tool input.
 * @returns The list of non-geometric property names to include in the WFS `propertyName` parameter, or an empty list to include all properties.
*
 */
function buildSelectList(featureType: Collection, geometryProperty: CollectionProperty, input: GpfWfsGetFeaturesInput) {
  // if `select` is specified, we only return the requested properties (after validation)
  if (input.select && input.select.length > 0) {
    const selectedProperties = input.select.map((propertyName) => compileSelectProperty(featureType, geometryProperty, propertyName));
    if (input.result_type === "request") {
      return [...selectedProperties, geometryProperty.name];
    }
    return selectedProperties;
  }

  // if `select` is omitted and result_type is `results`,
  // we return every non-geometric property 
  if (input.result_type === "results") {
    return featureType.properties
      .filter((property) => !property.defaultCrs)
      .map((property) => property.name);
  }

  // if `select` is omitted and result_type is `hits` or `request`
  // we don't specify any propertyName
  return [];
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
