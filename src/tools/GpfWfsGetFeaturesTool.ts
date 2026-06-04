import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import {
  executeGetFeatures,
  prepareGetFeaturesRequest,
} from "../wfs/features.js";
import { toWfsRequestPayload } from "../wfs/request.js";
import {
  gpfWfsGetFeaturesHitsOutputSchema,
  gpfWfsGetFeaturesInputSchema,
  type GpfWfsGetFeaturesInput,
  gpfWfsGetFeaturesPublishedInputSchema,
  gpfWfsGetFeaturesRequestOutputSchema,
} from "../wfs/schema.js";
import logger from "../logger.js";

/**
 * MCP tool exposing structured WFS feature search.
 *
 * The tool remains responsible for MCP schema exposure and response formatting.
 * WFS request preparation and execution live in the structured WFS engine.
 */

// --- Tool ---

class GpfWfsGetFeaturesTool extends BaseTool<GpfWfsGetFeaturesInput> {
  name = "gpf_wfs_get_features";
  title = "Lecture d’objets WFS";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Interroge un type WFS et renvoie des résultats structurés sans demander au modèle d'écrire du CQL ou du WFS.",
    "Utiliser `select` pour choisir les propriétés, `where` pour filtrer, `order_by` pour trier et un filtre spatial dédié (`bbox_filter`, `intersects_point_filter`, `dwithin_point_filter` ou `intersects_feature_filter`) pour le spatial. Avec `result_type=\"request\"`, la géométrie est automatiquement ajoutée aux propriétés sélectionnées pour garantir une requête cartographiable.",
    "Exemple attributaire : `where=[{ property: \"code_insee\", operator: \"eq\", value: \"75056\" }]`.",
    "Exemple bbox : `bbox_filter={ west: 2.1, south: 48.7, east: 2.5, north: 48.9 }`.",
    "Exemple point dans géométrie : `intersects_point_filter={ lon: 2.35, lat: 48.85 }`.",
    "Exemple distance : `dwithin_point_filter={ lon: 2.35, lat: 48.85, distance_m: 500 }`.",
    "Exemple réutilisation : `intersects_feature_filter={ typename, feature_id }` avec `typename` et `feature_id` issus d'une `feature_ref`.",
    "⚠️ Quand `typename` et `intersects_feature_filter.typename` sont identiques, utiliser `gpf_wfs_get_feature_by_id` pour récupérer exactement l'objet ciblé.",
    "**OBLIGATOIRE : toujours appeler `gpf_wfs_describe_type` avant ce tool, sauf si `gpf_wfs_describe_type` a déjà été appelé pour ce même typename dans la conversation en cours.**",
    "Les noms de propriétés **ne peuvent pas être devinés** : ils sont spécifiques à chaque typename et diffèrent systématiquement des conventions habituelles (ex : pas de nom_officiel, navigabilite sans accent, etc.). Toute tentative sans appel préalable à `gpf_wfs_describe_type` **provoquera une erreur.**",
  ].join("\n");

  // `schema` remains the runtime validation source, while `inputSchema`
  // publishes the MCP-facing variant expected by clients.
  schema = gpfWfsGetFeaturesInputSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfWfsGetFeaturesPublishedInputSchema;
  }

  /**
   * Formats compact responses (`hits`, `request`) into `structuredContent`.
   * Full result sets are still delegated to the framework default behavior.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response, optionally enriched with structured content.
   */
  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "hits" &&
      "totalFeatures" in data &&
      typeof data.totalFeatures === "number"
    ) {
      const payload = gpfWfsGetFeaturesHitsOutputSchema.parse(data);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "request"
    ) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: gpfWfsGetFeaturesRequestOutputSchema.parse(data),
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
   * @returns Either a compiled request, a hit count, or a transformed FeatureCollection.
   */
  async execute(input: GpfWfsGetFeaturesInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    if (input.result_type === "request") {
      const { request } = await prepareGetFeaturesRequest(input);
      return toWfsRequestPayload(request);
    }

    return executeGetFeatures(input);
  }
}

export default GpfWfsGetFeaturesTool;
