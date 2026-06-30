import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import {
  executeGetOrCountFeatures,
} from "../wfs/features.js";
import {
  gpfCountFeaturesOutputSchema,
  gpfCountFeaturesInputSchema,
  gpfCountFeaturesInputObjectSchema,
  type GpfCountFeaturesInput,
  gpfCountFeaturesPublishedInputSchema,
} from "../wfs/schema.js";
import logger from "../logger.js";

/**
 * MCP tool returning the number of GPF features matching a query.
 *
 * Counting counterpart of GpfGetFeaturesTool: same filters, but returns only
 * the match count via the shared WFS execution path.
 */

// --- Tool ---

class GpfCountFeaturesTool extends BaseTool<GpfCountFeaturesInput> {
  name = "gpf_count_features";
  title = "Décompte d’objets GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Interroge un type GPF et renvoie le nombre de résultats obtenus.",
    "Voir la description de `gpf_get_features` pour la liste des filtres possibles.",
  ].join("\n");

  // The framework requires a plain Zod object here to publish a compatible
  // input schema. Cross-field runtime validation is applied in `execute`.
  schema = gpfCountFeaturesInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfCountFeaturesPublishedInputSchema;
  }

  /**
   * Formats compact responses  into `structuredContent`.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response.
   */
  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "numberMatched" in data &&
      typeof data.numberMatched === "number"
    ) {
      const payload = gpfCountFeaturesOutputSchema.parse(data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }

    return super.createSuccessResponse(data);
  }

  /**
   * Orchestrates the MCP-facing execution flow.
   *
   * Request previews stay in the tool because they are a tool-specific output
   * mode, while the WFS-side preparation and execution live in `features.ts`.
   *
   * @param input Normalized tool input.
   * @returns A hit count.
   */
  async execute(input: GpfCountFeaturesInput) {
    const validatedInput = gpfCountFeaturesInputSchema.parse(input);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: validatedInput
    });

    return executeGetOrCountFeatures(validatedInput);
  }
}

export default GpfCountFeaturesTool;
