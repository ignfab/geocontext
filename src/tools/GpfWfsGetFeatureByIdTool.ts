/**
 * MCP tool exposing exact WFS feature lookup by `feature_id`.
 *
 * The tool keeps MCP-facing concerns such as schema exposure, compact response
 * formatting, and request-preview output. The `results` execution flow itself
 * is delegated to the structured WFS engine.
 */

import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { buildPropertyName, executeGetFeatureById } from "../wfs/byId.js";
import { wfsClient } from "../wfs/execution.js";
import {
  buildGetFeatureByIdRequest,
  toWfsHttpGetUrlPayload,
  toWfsHttpPostRequestPayload,
} from "../wfs/request.js";
import {
  gpfWfsGetFeatureByIdHttpGetUrlOutputSchema,
  gpfWfsGetFeatureByIdHttpPostRequestOutputSchema,
  gpfWfsGetFeatureByIdInputSchema,
  type GpfWfsGetFeatureByIdInput,
  gpfWfsGetFeatureByIdPublishedInputSchema,
} from "../wfs/schema.js";
import logger from "../logger.js";

// --- Tool ---

class GpfWfsGetFeatureByIdTool extends BaseTool<GpfWfsGetFeatureByIdInput> {
  name = "gpf_wfs_get_feature_by_id";
  title = "Lecture d’un objet WFS par identifiant";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Récupère exactement un objet WFS à partir de `typename` et `feature_id`, sans filtre attributaire ni spatial.",
    "Ce tool est le chemin robuste quand vous disposez déjà d'une `feature_ref { typename, feature_id }` issue d'un autre tool (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_wfs_get_features`).",
    "Le contrat garantit une cardinalité stricte : 0 résultat ou plusieurs résultats provoquent une erreur explicite.",
    "Utiliser `result_type=\"http_post_request\"` pour récupérer une requête WFS POST robuste, ou `result_type=\"http_get_url\"` pour récupérer l'URL GET WFS équivalente et l'utiliser ou la visualiser dans un outil la supportant."
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
   * Formats compact responses (`http_post_request`, `http_get_url`, `results`) into `structuredContent`.
   *
   * We intentionally do not expose a single `outputSchemaShape` for the tool as
   * a whole: the `results` path returns a generic FeatureCollection whose
   * feature properties depend on the queried WFS layer, while HTTP preview
   * modes have compact, closed shapes that are worth validating explicitly.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response, optionally enriched with structured content.
   */
  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "http_post_request"
    ) {
      const payload = gpfWfsGetFeatureByIdHttpPostRequestOutputSchema.parse(data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "http_get_url"
    ) {
      const payload = gpfWfsGetFeatureByIdHttpGetUrlOutputSchema.parse(data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }

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
      "Réponse interne inattendue pour gpf_wfs_get_feature_by_id : le résultat devrait être une requête HTTP WFS, une URL GET WFS ou une FeatureCollection.",
    );
  }

  /**
   * Orchestrates the by-id execution flow:
   * schema lookup -> request compilation -> optional HTTP preview output -> WFS execution -> cardinality validation.
   *
   * @param input Normalized tool input.
   * @returns Either an HTTP preview payload or a transformed FeatureCollection containing one feature.
   */
  async execute(input: GpfWfsGetFeatureByIdInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    if (input.result_type === "http_post_request" || input.result_type === "http_get_url") {
      // HTTP preview modes are handled here because they return a preview payload,
      // not the actual by-id WFS result.
      const featureType = await wfsClient.getFeatureType(input.typename);
      const propertyName = buildPropertyName(featureType, {
        includeGeometry: input.geometrykind.size != 0,
        select: input.select,
      });
      const request = buildGetFeatureByIdRequest(input.typename, input.feature_id, propertyName);
      return input.result_type === "http_post_request"
        ? toWfsHttpPostRequestPayload(request)
        : toWfsHttpGetUrlPayload(request);
    }

    return executeGetFeatureById({
      typename: input.typename,
      feature_id: input.feature_id,
      select: input.select,
      geometrykind: input.geometrykind,
    });
  }
}

export default GpfWfsGetFeatureByIdTool;
