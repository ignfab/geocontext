import { AsyncLocalStorage } from "node:async_hooks";
import { MCPTool } from "mcp-framework";

import { normalizeToolError } from "../errors/toolError.js";
import logger from "../logger.js";

const toolInputStorage = new AsyncLocalStorage<Record<string, unknown>>();

export default abstract class BaseTool<TInput extends Record<string, any> = any> extends MCPTool<TInput> {
  async toolCall(request: {
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    };
  }) {
    return toolInputStorage.run(request.params.arguments || {}, () => super.toolCall(request));
  }

  protected createErrorResponse(error: unknown) {
    const payload = normalizeToolError(error);
    const metadata: Record<string, unknown> = {
      tool: this.name,
      problem_type: payload.type,
      problem_title: payload.title,
      error_codes: payload.errors.map((item) => item.code),
    };

    const toolInput = toolInputStorage.getStore();
    if (toolInput !== undefined) {
      metadata.input = toolInput;
    }

    if (payload.upstream?.status !== undefined) {
      metadata.upstream_status = payload.upstream.status;
    }

    if (error instanceof Error && error.name !== "Error") {
      metadata.error_name = error.name;
    }

    logger.error(`[tool] failed ${this.name}: ${payload.detail}`, metadata);

    return {
      content: [
        {
          type: "text" as const,
          text: payload.detail,
        },
      ],
      structuredContent: payload as Record<string, unknown>,
      isError: true,
    };
    
  }
}
