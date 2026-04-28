import { expect } from "vitest";

interface ResultsContainer<T> {
  results?: readonly T[];
}

interface FeatureCollectionLike<TFeature> {
  type?: unknown;
  features?: readonly TFeature[];
}

/**
 * Asserts that a tool result contains a non-empty `results` array.
 *
 * @param value Tool result containing a `results` field.
 * @param minimum Minimum number of expected entries.
 * @returns Nothing.
 */
export function expectNonEmptyResults<T>(
  value: ResultsContainer<T>,
  minimum = 1,
): asserts value is { results: T[] } {
  expect(value.results).toBeDefined();
  expect(value.results.length).toBeGreaterThanOrEqual(minimum);
}

/**
 * Asserts that a value is a `FeatureCollection` with a non-empty `features` array.
 *
 * @param value Candidate feature collection.
 * @param minimum Minimum number of expected features.
 * @returns Nothing.
 */
export function expectFeatureCollectionWithFeatures<TFeature>(
  value: FeatureCollectionLike<TFeature>,
  minimum = 1,
): asserts value is { type: "FeatureCollection"; features: TFeature[] } {
  expect(value.type).toBe("FeatureCollection");
  expect(value.features).toBeDefined();
  expect(value.features.length).toBeGreaterThanOrEqual(minimum);
}

/**
 * Asserts that a tool call promise fails with an error.
 *
 * @param toolCallPromise Promise returned by a tool call.
 * @returns Promise resolved when the failure assertion completes.
 */
export async function expectToolCallToThrow(toolCallPromise: Promise<unknown>): Promise<void> {
  await expect(toolCallPromise).rejects.toThrow();
}
