/**
 * MCP tool exposing exact WFS feature lookup by `feature_id`.
 *
 * The tool keeps MCP-facing concerns such as schema exposure and response
 * formatting. The execution flow itself is delegated to the structured WFS engine.
 */

import type { McpTool } from "../helpers/tools.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { executeGetFeatureById } from "../wfs/byId.js";
import {
  gpfGetFeatureByIdInputSchema,
  type GpfGetFeatureByIdInput,
} from "../wfs/schema.js";
import logger from "../logger.js";

// --- Tool ---

const GPF_GET_FEATURE_BY_ID_TOOL_DESCRIPTION = [
  "Récupère exactement un objet GPF à partir de `typename` et `feature_id`, sans filtre attributaire ni spatial.",
  "Ce tool est le chemin robuste quand vous disposez déjà d'une `feature_ref { typename, feature_id }` issue d'un autre tool (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_get_features`).",
  "Le contrat garantit une cardinalité stricte : 0 résultat ou plusieurs résultats provoquent une erreur explicite.",
  "Utiliser `spatial_extras` pour renvoyer une information géométrique dérivée (bbox, centroïde, ...) de l'objet."
].join("\n");

class GpfGetFeatureByIdTool implements McpTool<typeof gpfGetFeatureByIdInputSchema> {
  name = "gpf_get_feature_by_id";
  title = "Lecture d’un objet GPF par identifiant";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = GPF_GET_FEATURE_BY_ID_TOOL_DESCRIPTION;

  inputSchema = gpfGetFeatureByIdInputSchema;

  /**
   * Formats the `results` FeatureCollection into `structuredContent`.
   *
   * We intentionally do not expose an `outputSchema` for the tool: the
   * returned FeatureCollection's feature properties depend on the queried WFS
   * layer, so it has no closed shape worth validating.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response enriched with structured content.
   */
  createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === "FeatureCollection"
    ) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data as Record<string, unknown>,
      };
    }

    throw new Error(
      "Réponse interne inattendue pour gpf_get_feature_by_id : le résultat devrait être une FeatureCollection.",
    );
  }

  /**
   * Orchestrates the by-id execution flow:
   * WFS execution -> cardinality validation.
   *
   * @param input Normalized tool input.
   * @returns A transformed FeatureCollection containing one feature.
   */
  async execute(input: GpfGetFeatureByIdInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input
    });

    return executeGetFeatureById(input);
  }
}

export default GpfGetFeatureByIdTool;
