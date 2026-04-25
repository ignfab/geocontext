import { MCPTool } from "mcp-framework";

import { normalizeToolError } from "../helpers/errors/toolError.js";

export default abstract class BaseTool<TInput extends Record<string, any> = any> extends MCPTool<TInput> {
  protected createErrorResponse(error: unknown) {
    const payload = normalizeToolError(error);

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
