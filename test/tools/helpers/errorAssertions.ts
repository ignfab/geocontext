import { expect } from "vitest";

/**
 * Shared assertions over tool error responses, keeping the expected shape and
 * FR wording in one place rather than in every tool test.
 */

type ToolResponse = {
  isError?: boolean;
  structuredContent?: unknown;
  content: Array<{ type: string; text?: string }>;
};

/**
 * Extracts the text of an error response, asserting its shape along the way.
 *
 * @param response Tool response expected to be an error.
 * @returns The error message text.
 */
export function expectErrorText(response: ToolResponse) {
  expect(response.isError).toBe(true);
  // Reserved for the success-path `outputSchema`; never set on errors.
  expect(response.structuredContent).toBeUndefined();

  const textContent = response.content[0];
  if (textContent?.type !== "text" || typeof textContent.text !== "string") {
    throw new Error("expected text content");
  }
  return textContent.text;
}

/**
 * Asserts that a response rejected an out-of-range `lon`.
 *
 * @param response Tool response expected to be a validation error.
 */
export function expectInvalidLon(response: ToolResponse) {
  expect(expectErrorText(response)).toContain("Paramètres invalides");
}
