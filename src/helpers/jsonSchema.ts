import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

export function generatePublishedInputSchema(schema: any) {
  return toJsonSchemaCompat(schema, {
    strictUnions: true,
    pipeStrategy: "input",
  });
}
