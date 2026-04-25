/**
 * MCP tool exposing exact WFS feature lookup by `feature_id`.
 *
 * The tool keeps MCP-facing concerns such as schema exposure, compact response
 * formatting, and request-preview output. The `results` execution flow itself
 * is delegated to the structured WFS engine.
 */

import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { buildPropertyName, executeGetFeatureById } from "../helpers/wfs_engine/byId.js";
import { getFeatureType } from "../helpers/wfs_engine/execution.js";
import {
  buildGetFeatureByIdRequest,
  toWfsRequestPayload,
} from "../helpers/wfs_engine/request.js";
import {
  gpfWfsGetFeatureByIdInputSchema,
  type GpfWfsGetFeatureByIdInput,
  gpfWfsGetFeatureByIdPublishedInputSchema,
  gpfWfsGetFeatureByIdRequestOutputSchema,
} from "../helpers/wfs_engine/schema.js";

// --- Tool ---

class GpfWfsGetFeatureByIdTool extends BaseTool<GpfWfsGetFeatureByIdInput> {
  name = "gpf_wfs_get_feature_by_id";
  title = "Lecture d’un objet WFS par identifiant";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Récupère exactement un objet WFS à partir de `typename` et `feature_id`, sans filtre attributaire ni spatial.",
    "Ce tool est le chemin robuste quand vous disposez déjà d'une `feature_ref { typename, feature_id }` issue d'un autre tool (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_wfs_get_features`).",
    "Le contrat garantit une cardinalité stricte : 0 résultat ou plusieurs résultats provoquent une erreur explicite.",
    "Utiliser `result_type=\"request\"` pour récupérer la requête WFS compilée (avec `get_url`) et l'utiliser ou la visualiser ailleurs."
  ].join("\n");

  // `schema` remains the runtime validation source, while `inputSchema`
  // publishes the MCP-facing variant expected by clients.
  schema = gpfWfsGetFeatureByIdInputSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfWfsGetFeatureByIdPublishedInputSchema;
  }

  /**
   * Formats compact responses (`request`) into `structuredContent`.
   *
   * We intentionally do not expose a single `outputSchemaShape` for the tool as
   * a whole: the `results` path returns a generic FeatureCollection whose
   * feature properties depend on the queried WFS layer, while `request` has a
   * compact, closed shape that is worth validating explicitly.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response, optionally enriched with structured content.
   */
  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "request"
    ) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: gpfWfsGetFeatureByIdRequestOutputSchema.parse(data),
      };
    }

    return super.createSuccessResponse(data);
  }

  /**
   * Orchestrates the by-id execution flow:
   * schema lookup -> request compilation -> optional request output -> WFS execution -> cardinality validation.
   *
   * @param input Normalized tool input.
   * @returns Either a compiled request or a transformed FeatureCollection containing one feature.
   */
  async execute(input: GpfWfsGetFeatureByIdInput) {
    if (input.result_type === "request") {
      // The `request` mode is handled here because it returns a preview payload,
      // not the actual by-id WFS result.
      const featureType = await getFeatureType(input.typename);
      const propertyName = buildPropertyName(featureType, {
        includeGeometry: true,
        select: input.select,
      });
      const request = buildGetFeatureByIdRequest(input.typename, input.feature_id, propertyName);
      return toWfsRequestPayload(request);
    }

    return executeGetFeatureById({
      typename: input.typename,
      feature_id: input.feature_id,
      select: input.select,
    });
  }
}

export default GpfWfsGetFeatureByIdTool;
