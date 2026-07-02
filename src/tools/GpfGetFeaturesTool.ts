import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import {
  executeQueryFeatures,
} from "../wfs/features.js";
import {
  gpfGetFeaturesInputSchema,
  gpfGetFeaturesInputObjectSchema,
  type GpfGetFeaturesInput,
  gpfGetFeaturesPublishedInputSchema,
  GPF_SPATIAL_FILTER_DOCNAMES,
} from "../wfs/schema.js";
import logger from "../logger.js";

/**
 * MCP tool exposing structured WFS feature search.
 *
 * The tool remains responsible for MCP schema exposure and response formatting.
 * WFS request preparation and execution live in the structured WFS engine.
 */

// --- Tool ---

class GpfGetFeaturesTool extends BaseTool<GpfGetFeaturesInput> {
  name = "gpf_get_features";
  title = "Lecture d’objets GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Interroge un type GPF et renvoie des résultats structurés (propriétés attributaires ; les géométries ne sont pas incluses). Pour obtenir une couche cartographiable, utiliser `gpf_get_features_layer`.",
    `Utiliser \`select\` pour choisir les propriétés, \`where\` pour filtrer, \`order_by\` pour trier et un filtre spatial dédié (${GPF_SPATIAL_FILTER_DOCNAMES}) pour le spatial.`,
    "Exemple attributaire : `where=[{ property: \"code_insee\", operator: \"eq\", value: \"75056\" }]`.",
    "Exemple bbox : `bbox_filter={ west: 2.1, south: 48.7, east: 2.5, north: 48.9 }`.",
    "Exemple point dans géométrie : `intersects_point_filter={ lon: 2.35, lat: 48.85 }`.",
    "Exemple distance : `dwithin_point_filter={ lon: 2.35, lat: 48.85, distance_m: 500 }`.",
    "Exemple réutilisation : `intersects_feature_filter={ typename, feature_id }` ou bien `adjacent_feature_filter={ typename, feature_id }` avec `typename` et `feature_id` issus d'une `feature_ref`.",
    "Exemple temps de trajet : `travel_time_filter={ lon: 2.35, lat: 48.85, minutes: 15, profile: \"pedestrian\" }` pour les objets atteignables en 15 minutes à pied depuis ce point.",
    "⚠️ Quand `typename` et `intersects_feature_filter.typename` sont identiques, utiliser `gpf_get_feature_by_id` pour récupérer exactement l'objet ciblé.",
    "**OBLIGATOIRE : toujours appeler `gpf_describe_type` avant ce tool, sauf si `gpf_describe_type` a déjà été appelé pour ce même typename dans la conversation en cours.**",
    "Les noms de propriétés **ne peuvent pas être devinés** : ils sont spécifiques à chaque typename et diffèrent systématiquement des conventions habituelles (ex : pas de nom_officiel, navigabilite sans accent, etc.). Toute tentative sans appel préalable à `gpf_describe_type` **provoquera une erreur.**",
  ].join("\n");

  // The framework requires a plain Zod object here to publish a compatible
  // input schema. Cross-field runtime validation is applied in `execute`.
  schema = gpfGetFeaturesInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfGetFeaturesPublishedInputSchema;
  }

  /**
   * Orchestrates the MCP-facing execution flow.
   *
   * WFS-side preparation and execution live in `features.ts`; the tool only
   * validates the input and delegates.
   *
   * @param input Normalized tool input.
   * @returns A transformed FeatureCollection.
   */
  async execute(input: GpfGetFeaturesInput) {
    const validatedInput = gpfGetFeaturesInputSchema.parse(input);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: validatedInput
    });

    return executeQueryFeatures(validatedInput);
  }
}

export default GpfGetFeaturesTool;
