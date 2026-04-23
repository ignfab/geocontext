import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

export type PublishedInputSchema = {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
  $schema?: string;
  [key: string]: unknown;
};

/**
 * Converts a Zod input schema into an MCP-compatible JSON Schema for publication.
 *
 * Uses strict union emission and, for `z.pipe(...)`, publishes the pre-transform
 * argument shape (the value callers must send), not the transformed output shape.
 *
 * Note: with our current Zod v3 stack, the compat converter still emits an
 * explicit draft-07 `$schema`. MCP defaults to 2020-12 only when `$schema` is
 * absent, so callers should not assume this helper publishes 2020-12 today.
 * The SDK helper supports a 2020-12 target on its Zod v4 path, but that option
 * has no effect for the Zod v3 conversion path currently used in this repo.
 */
export function generatePublishedInputSchema(schema: any): PublishedInputSchema {
  return toJsonSchemaCompat(schema, {
    strictUnions: true,
    pipeStrategy: "input",
  }) as PublishedInputSchema;
}
