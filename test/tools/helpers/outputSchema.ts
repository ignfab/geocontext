import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateStructuredContentAgainstOutputSchema(
  outputSchema: unknown,
  structuredContent: unknown,
): string | null {
  if (outputSchema == null) {
    return null;
  }

  const validate = ajv.compile(outputSchema);
  return validate(structuredContent)
    ? null
    : ajv.errorsText(validate.errors, { separator: "; " }) || "validation error";
}
