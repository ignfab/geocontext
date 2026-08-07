import Ajv from "ajv";
import type { AnySchema } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

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
