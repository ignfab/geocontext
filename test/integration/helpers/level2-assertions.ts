import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import { expect } from "vitest";

interface SerializedToolCandidate {
  name?: unknown;
  id?: unknown;
}

/**
 * Extracts a human-readable tool name from LangChain serialized metadata.
 *
 * LangChain callbacks may expose either `name` directly, or only an `id` array
 * where the last item corresponds to the runnable/tool name.
 *
 * @param tool Serialized LangChain runnable metadata.
 * @returns Extracted tool name, or `undefined` when not found.
 */
export function extractToolName(tool: Serialized): string | undefined {
  const candidate = tool as unknown as SerializedToolCandidate;

  if (typeof candidate.name === "string" && candidate.name.length > 0) {
    return candidate.name;
  }

  if (Array.isArray(candidate.id) && candidate.id.length > 0) {
    const last = candidate.id[candidate.id.length - 1];
    if (typeof last === "string" && last.length > 0) {
      return last;
    }
  }

  return undefined;
}

/**
 * Normalizes text for resilient assertions by replacing non-breaking spaces,
 * lowercasing content, and removing diacritics.
 *
 * @param text Raw text to normalize.
 * @returns Normalized text suitable for robust `contains` assertions.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\u202f/g, " ")
    .replace(/\xa0/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Minimal message shape required by this helper module. */
export type MessageLike = {
  content: unknown;
};

/**
 * Returns the normalized content of the final agent message.
 *
 * @param messages Agent message list.
 * @returns Normalized text content of the last message.
 * @throws {Error} When the message list is empty.
 */
export function normalizedFinalMessage(messages: readonly MessageLike[]): string {
  if (messages.length === 0) {
    throw new Error("Agent returned no messages.");
  }

  return normalizeText(String(messages[messages.length - 1].content));
}

/**
 * Asserts that all expected fragments are present in the input text.
 *
 * @param text Text to inspect.
 * @param expectedFragments Fragments that must all be present.
 * @returns Nothing.
 */
export function expectContainsAll(text: string, expectedFragments: readonly string[]): void {
  const normalizedText = normalizeText(text);

  for (const fragment of expectedFragments) {
    expect(normalizedText).toContain(normalizeText(fragment));
  }
}

/**
 * Normalizes the final message, asserts all expected fragments, and returns
 * the normalized message for additional assertions.
 *
 * @param messages Agent message list.
 * @param expectedFragments Fragments that must all be present.
 * @returns Normalized final message text.
 */
export function expectNormalizedFinalMessageContainsAll(
  messages: readonly MessageLike[],
  expectedFragments: readonly string[],
): string {
  const text = normalizedFinalMessage(messages);
  expectContainsAll(text, expectedFragments);
  return text;
}

/**
 * Tracks tool calls observed through LangChain callbacks.
 */
export class ToolCallTracker extends BaseCallbackHandler {
  name = "tool-call-tracker";
  private readonly toolCalls = new Set<string>();

  /**
   * Records a tool call when LangChain starts a tool.
   *
   * @param tool Serialized tool metadata.
   * @returns Nothing.
   */
  handleToolStart(tool: Serialized): void {
    const toolName = extractToolName(tool);
    if (toolName) {
      this.toolCalls.add(toolName);
    }
  }

  /**
   * Checks whether a tool name was observed at least once.
   *
   * @param toolName Tool name to check.
   * @returns `true` when the tool call has been observed, else `false`.
   */
  hasToolCall(toolName: string): boolean {
    return this.toolCalls.has(toolName);
  }
}
