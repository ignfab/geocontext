import { describe, expect, it } from "vitest";
import type { CollectionProperty } from "@ignfab/gpf-schema-store";

import { formatScalarValue, normalizeWhereClause } from "../../src/wfs/attributeFilter";
import type { WhereClause } from "../../src/wfs/schema";

// Minimal catalog properties covering the coercion branches.
const integerProperty: CollectionProperty = { name: "population", type: "integer" };
const floatProperty: CollectionProperty = { name: "hauteur", type: "float" };
const booleanProperty: CollectionProperty = { name: "actif", type: "boolean" };
const enumProperty: CollectionProperty = { name: "nature", type: "string", enum: ["Chapelle", "Eglise"] };

describe("attributeFilter/normalizeWhereClause", () => {
  // --- Numeric coercion rejection (regression guard for the empty/hex silent-coercion bug) ---

  it.each(["", "   ", "0x1F", "0b101", "1e3", "1.5E-2", "Infinity", "1,5", "+5", "abc", "3.14.15"])(
    "rejects value=%o on an integer property instead of silently coercing",
    (bad) => {
      const clause = { property: "population", operator: "eq", value: bad } as WhereClause;
      expect(() => normalizeWhereClause(integerProperty, clause)).toThrow(/valeur entière/);
    },
  );

  it.each(["", "   ", "0x1F", "1e3", "Infinity", "1,5", "abc"])(
    "rejects value=%o on a float property with an ordered operator",
    (bad) => {
      const clause = { property: "hauteur", operator: "gt", value: bad } as WhereClause;
      expect(() => normalizeWhereClause(floatProperty, clause)).toThrow(/numérique/);
    },
  );

  // --- Numeric coercion acceptance (no regression on valid decimals) ---

  it.each([
    ["-12", -12],
    ["3.14", 3.14],
    [".5", 0.5],
    ["1000", 1000],
    [" 42 ", 42],
    ["0", 0],
  ] as const)("accepts decimal value=%o and coerces to %o", (input, expected) => {
    const clause = { property: "hauteur", operator: "eq", value: input } as WhereClause;
    expect(normalizeWhereClause(floatProperty, clause)).toMatchObject({ operator: "eq", value: expected });
  });

  it("accepts integers and coerces to a number", () => {
    const clause = { property: "population", operator: "gte", value: "1000" } as WhereClause;
    expect(normalizeWhereClause(integerProperty, clause)).toMatchObject({ operator: "gte", value: 1000 });
  });

  it("emits a plain decimal CQL literal after coercion", () => {
    const normalized = normalizeWhereClause(floatProperty, {
      property: "hauteur",
      operator: "eq",
      value: "3.14",
    } as WhereClause);
    expect(formatScalarValue((normalized as { value: number }).value)).toBe("3.14");
  });

  // --- Other coercion / validation branches ---

  it("rejects a value outside the property enum", () => {
    const clause = { property: "nature", operator: "eq", value: "Mosquée" } as WhereClause;
    expect(() => normalizeWhereClause(enumProperty, clause)).toThrow(/parmi/);
  });

  it("accepts a value inside the property enum", () => {
    const clause = { property: "nature", operator: "eq", value: "Eglise" } as WhereClause;
    expect(normalizeWhereClause(enumProperty, clause)).toMatchObject({ operator: "eq", value: "Eglise" });
  });

  it("rejects a non-boolean string on a boolean property", () => {
    const clause = { property: "actif", operator: "eq", value: "oui" } as WhereClause;
    expect(() => normalizeWhereClause(booleanProperty, clause)).toThrow(/booléenne/);
  });

  it("coerces 'true'/'false' on a boolean property", () => {
    const clause = { property: "actif", operator: "eq", value: "true" } as WhereClause;
    expect(normalizeWhereClause(booleanProperty, clause)).toMatchObject({ operator: "eq", value: true });
  });

  it("rejects ordered operators on a non-numeric, non-date property", () => {
    const clause = { property: "nature", operator: "gt", value: "Eglise" } as WhereClause;
    expect(() => normalizeWhereClause(enumProperty, clause)).toThrow(/numérique ou de date/);
  });

  // --- Clause-shape guards ---

  it("rejects `in` with an empty values array", () => {
    const clause = { property: "population", operator: "in", values: [] } as unknown as WhereClause;
    expect(() => normalizeWhereClause(integerProperty, clause)).toThrow(/non vide/);
  });

  it("rejects `is_null` carrying a value", () => {
    const clause = { property: "population", operator: "is_null", value: "1" } as unknown as WhereClause;
    expect(() => normalizeWhereClause(integerProperty, clause)).toThrow(/n'accepte ni/);
  });
});
