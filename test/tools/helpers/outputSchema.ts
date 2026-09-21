import Ajv from "ajv";
import type { AnySchema } from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: false });
// Without this, `format: "uri"` on `data_url` is unknown to Ajv and — because
// `strict: false` warns instead of throwing — silently skipped.
addFormats(ajv);

export function validateStructuredContentAgainstOutputSchema(
  outputSchema: unknown,
  structuredContent: unknown,
): string | null {
  if (outputSchema == null) {
    throw new Error("No output schema.");
  }
  const validate = ajv.compile(outputSchema as AnySchema);
  return validate(structuredContent)
    ? null
    : ajv.errorsText(validate.errors, { separator: "; " }) || "validation error";
}
