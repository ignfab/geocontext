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
 * Asserts that an error text holds a French message on `name` stating `condition`,
 * without pinning the wording of the Zod locale (it may change on upgrade).
 *
 * @param text Error text, or `detail` of a normalized tool error.
 * @param name Parameter name the message must be prefixed with.
 * @param condition Pattern the message must match (bound, allowed values...).
 */
export function expectFrenchIssue(text: string, name: string, condition: RegExp) {
  expect(text).toMatch(/^Paramètres invalides : /);
  // Each message ends with a period: split before every `param: ` prefix, keep the one on `name`.
  const messages = text.replace(/^Paramètres invalides : /, "").split(/(?<=[.!?]) (?=\S+: )/);
  const message = messages.find((item) => item.startsWith(`${name}: `));
  expect(message, text).toBeDefined();
  expect(message).toMatch(/requis|invalide|attendu|trop/i);
  expect(message).toMatch(condition);
}

/**
 * Asserts that a response rejected an out-of-range `lon`.
 *
 * @param response Tool response expected to be a validation error.
 */
export function expectInvalidLon(response: ToolResponse) {
  // `detail` is the only channel left: pin param name and bound.
  expectFrenchIssue(expectErrorText(response), "lon", /180/);
}
