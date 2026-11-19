import type { CallToolResult, McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

import { normalizeToolError } from "../errors/toolError.js";
import logger from "../logger.js";

/**
 * Contract implemented by every MCP tool.
 *
 * The SDK publishes `inputSchema` and `outputSchema` as JSON Schema. `execute`
 * receives the input parsed by `registerTool`, and its result must match
 * `outputSchema` when one is declared (validated by `successResult`, unless
 * `createSuccessResponse` formats it).
 */
export interface McpTool<I extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: I;
  outputSchema?: z.ZodObject;

  execute(input: z.output<I>): Promise<unknown>;

  /**
   * Formats the result of `execute`, instead of the JSON formatting of `successResult`.
   */
  createSuccessResponse?(data: unknown): CallToolResult;
}

/**
 * Formats the result of `execute`: with `createSuccessResponse` when the tool
 * defines one, otherwise as JSON, also exposed as `structuredContent` when the
 * tool declares an output schema.
 *
 * @param tool Tool that produced the result.
 * @param data Result returned by `execute`.
 * @returns An MCP success response.
 */
export function successResult(tool: McpTool, data: unknown): CallToolResult {
  if (tool.createSuccessResponse) {
    return tool.createSuccessResponse(data);
  }
  if (!tool.outputSchema) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }

  // Parsing strips the keys a plain `z.object` output schema does not declare,
  // which the SDK publishes with `additionalProperties: false`.
  const parsed = tool.outputSchema.safeParse(data);
  if (!parsed.success) {
    // A plain `Error`, not the `ZodError`: a result breaking the output schema is
    // a server-side failure, not invalid tool parameters.
    throw new Error(
      `Le résultat de l'outil ${tool.name} ne respecte pas son schéma de sortie : ${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    content: [{ type: "text", text: JSON.stringify(parsed.data) }],
    structuredContent: parsed.data,
  };
}

/**
 * Converts an execution error into a logged, FR-normalized MCP error response.
 *
 * @param toolName Name of the failing tool.
 * @param error Error thrown by the tool.
 * @param input Tool arguments as received, logged for diagnosis.
 * @returns An MCP error response.
 */
function errorResult(toolName: string, error: unknown, input: unknown): CallToolResult {
  const payload = normalizeToolError(error);
  // Undefined metadata is left out of the log.
  logger.error(`[tool] failed ${toolName}: ${payload.detail}`, {
    tool: toolName,
    problem_type: payload.type,
    problem_title: payload.title,
    error_codes: payload.errors.map((item) => item.code),
    input,
    upstream_status: payload.upstream?.status,
    error_name: error instanceof Error && error.name !== "Error" ? error.name : undefined,
  });
  return { content: [{ type: "text", text: payload.detail }], isError: true };
}

/**
 * Registers a tool on the MCP server.
 *
 * The SDK publishes the input schema but does not validate it: the input is
 * parsed here, so invalid parameters get the same FR error response (and log)
 * as any other failure. Any error thrown by the parsing, by `execute` or by the
 * success formatting becomes an `isError` response.
 *
 * @param server MCP server to register the tool on.
 * @param tool Tool to register.
 */
export function registerTool(server: McpServer, tool: McpTool) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
      // Published as is, but accepted without validation: parsed below.
      inputSchema: { "~standard": { ...tool.inputSchema["~standard"], validate: (value: unknown) => ({ value }) } },
      outputSchema: tool.outputSchema,
    },
    async (args: unknown) => {
      try {
        return successResult(tool, await tool.execute(tool.inputSchema.parse(args)));
      } catch (error) {
        return errorResult(tool.name, error, args);
      }
    },
  );
}
