/**
 * Where-clause normalization and value coercion helpers for the structured WFS query compiler.
 *
 * This module validates raw attribute filters against catalog property metadata
 * and produces normalized values ready for CQL rendering.
 */

import type { CollectionProperty } from "@ignfab/gpf-schema-store";

import type { WhereClause } from "./schema.js";

type ScalarValue = string | number | boolean;

type NormalizedWhereClause =
  | { property: string; operator: "eq" | "ne"; value: ScalarValue }
  | { property: string; operator: "lt" | "lte" | "gt" | "gte"; value: number | string }
  | { property: string; operator: "in"; values: ScalarValue[] }
  | { property: string; operator: "is_null" };

export const SCALAR_COMPARISON_OPERATORS = {
  eq: "=",
  ne: "<>",
} as const;

export const NUMERIC_COMPARISON_OPERATORS = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
} as const;

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
export function formatScalarValue(value: ScalarValue) {
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
export function normalizeWhereClause(property: CollectionProperty, clause: WhereClause): NormalizedWhereClause {
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
      if (clause.value !== undefined || !Array.isArray(clause.values) || clause.values.length === 0 || !clause.values.every((value): value is string => typeof value === "string")) {
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
