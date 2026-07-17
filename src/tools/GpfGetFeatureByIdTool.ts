/**
 * MCP tool exposing exact WFS feature lookup by `feature_id`.
 *
 * The tool keeps MCP-facing concerns such as schema exposure and response
 * formatting. The execution flow itself is delegated to the structured WFS engine.
 */

import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { executeGetFeatureById } from "../wfs/byId.js";
import {
  gpfGetFeatureByIdInputObjectSchema,
  gpfGetFeatureByIdInputSchema,
  type GpfGetFeatureByIdInput,
  gpfGetFeatureByIdPublishedInputSchema,
} from "../wfs/schema.js";
import logger from "../logger.js";

// --- Tool ---

class GpfGetFeatureByIdTool extends BaseTool<GpfGetFeatureByIdInput> {
  name = "gpf_get_feature_by_id";
  title = "Lecture d’un objet GPF par identifiant";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Récupère exactement un objet GPF à partir de `typename` et `feature_id`, sans filtre attributaire ni spatial.",
    "Ce tool est le chemin robuste quand vous disposez déjà d'une `feature_ref { typename, feature_id }` issue d'un autre tool (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_get_features`).",
    "Le contrat garantit une cardinalité stricte : 0 résultat ou plusieurs résultats provoquent une erreur explicite.",
    "Utiliser `spatial_extras` pour renvoyer une information géométrique dérivée (bbox, centroïde, ...) de l'objet."
  ].join("\n");

  // `schema` remains the runtime validation source, while `inputSchema`
  // publishes the MCP-facing variant expected by clients.
  // The framework requires a plain Zod object here to publish a compatible
  // input schema. Cross-field runtime validation is applied in `execute`.
  schema = gpfGetFeatureByIdInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfGetFeatureByIdPublishedInputSchema;
  }

  /**
   * Formats the `results` FeatureCollection into `structuredContent`.
   *
   * We intentionally do not expose an `outputSchemaShape` for the tool: the
   * returned FeatureCollection's feature properties depend on the queried WFS
   * layer, so it has no closed shape worth validating.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response enriched with structured content.
   */
  protected createSuccessResponse(data: unknown) {
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
   * schema validation -> WFS execution -> cardinality validation.
   *
   * @param input Normalized tool input.
   * @returns A transformed FeatureCollection containing one feature.
   */
  async execute(input: GpfGetFeatureByIdInput) {
    const validatedInput = gpfGetFeatureByIdInputSchema.parse(input);
    logger.info(`[tool] execute ${this.name} ...`, {
      input: validatedInput
    });

    return executeGetFeatureById({
      typename: validatedInput.typename,
      feature_id: validatedInput.feature_id,
      select: validatedInput.select,
      spatial_extras: validatedInput.spatial_extras,
    });
  }
}

export default GpfGetFeatureByIdTool;
