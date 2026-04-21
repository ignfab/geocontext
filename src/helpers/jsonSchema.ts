import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

/**
 * Converts a Zod input schema into an MCP-compatible JSON Schema for publication.
 *
 * Uses strict union emission and, for `z.pipe(...)`, publishes the pre-transform
 * argument shape (the value callers must send), not the transformed output shape.
 */
export function generatePublishedInputSchema(schema: any) {
  return toJsonSchemaCompat(schema, {
    strictUnions: true,
    pipeStrategy: "input",
  });
}
