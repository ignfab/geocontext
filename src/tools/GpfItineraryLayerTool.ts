/**
 * MCP tool producing an opaque, cartographiable layer URL for a Géoplateforme
 * itinerary request.
 *
 * The tool returns a short opaque `data_url` that the LLM passes verbatim to a
 * map client. Fetching it yields a GeoJSON FeatureCollection (a single LineString
 * feature) served by the stateless geodata proxy. The URL encodes the validated
 * request params as an opaque token, so the LLM can neither parse nor rebuild the
 * underlying upstream request.
 */

import BaseTool from "./BaseTool.js";

import { READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { getEnv } from "../config/env.js";
import { encodeToken } from "../proxy/token.js";
import { buildDataUrl } from "../proxy/dataUrl.js";
import {
  PROXY_TOKEN_KIND,
  gpfGetFeaturesLayerOutputSchema,
  gpfItineraryLayerInputObjectSchema,
  gpfItineraryLayerInputSchema,
  gpfItineraryLayerPublishedInputSchema,
  type GpfItineraryLayerInput,
} from "../wfs/schema.js";
import { ITINERARY_PEDESTRIAN_MAX_DIRECT_DISTANCE_METERS, NAVIGATION_ITINERARY_SOURCE } from "../gpf/itinerary.js";
import logger from "../logger.js";

const GPF_ITINERARY_LAYER_TOOL_DESCRIPTION = [
  "Interroge l'itinéraire entre deux points.",
  "À utiliser pour afficher ou cartographier un trajet. Pour obtenir seulement la distance et le temps de trajet, utiliser plutôt l'outil `distance`.",
  "Renvoie une **URL de couche cartographiable** (`data_url`) : une URL opaque, à passer telle quelle à un outil d'affichage cartographique (MCP Carto, ...). L'ouvrir renvoie une FeatureCollection GeoJSON contenant la géométrie LineString de l'itinéraire, avec ses propriétés `distance` (en mètres) et `time` (en minutes).",
  "Utiliser `departure`/`arrival` pour les points de départ et d'arrivée, `profile` pour le mode de déplacement (`car` ou `pedestrian`) et `optimize` pour choisir entre l'itinéraire le plus rapide (`time`) ou le plus court (`distance`).",
  `Avec \`pedestrian\`, le départ et l'arrivée doivent être distants d'au plus ${ITINERARY_PEDESTRIAN_MAX_DIRECT_DISTANCE_METERS / 1000} km à vol d'oiseau.`,
  `(source : ${NAVIGATION_ITINERARY_SOURCE}).`,
].join("\n");

// --- Tool ---

class GpfItineraryLayerTool extends BaseTool<GpfItineraryLayerInput> {
  name = "gpf_itinerary_layer";
  title = "Couche cartographiable d’itinéraire GPF";
  annotations = READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS;
  description = GPF_ITINERARY_LAYER_TOOL_DESCRIPTION;
  protected outputSchemaShape = gpfGetFeaturesLayerOutputSchema;

  // The framework requires a plain Zod object here to publish a compatible input
  // schema. `execute` re-parses through `gpfItineraryLayerInputSchema` so the
  // crow-flies distance cap still runs before a token is minted.
  schema = gpfItineraryLayerInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfItineraryLayerPublishedInputSchema;
  }

  /**
   * Formats the `{ data_url }` response into `structuredContent`.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns An MCP success response enriched with structured content.
   */
  protected createSuccessResponse(data: unknown) {
    const payload = gpfGetFeaturesLayerOutputSchema.parse(data);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  /**
   * Mints the opaque proxy URL for the requested itinerary. No upstream call is
   * made here: the route itself is computed by the proxy when the `data_url`
   * is fetched.
   *
   * @param input Validated itinerary layer input.
   * @returns The `{ data_url }` payload carrying the opaque token.
   */
  async execute(input: GpfItineraryLayerInput) {
    const env = getEnv();

    if (!env.PROXY_URL_SECRET || !env.PROXY_PUBLIC_BASE_URL) {
      throw new Error(
        "`gpf_itinerary_layer` nécessite un proxy geodata configuré (variables d'environnement `PROXY_URL_SECRET` et `PROXY_PUBLIC_BASE_URL`, pointant vers un proxy joignable).",
      );
    }

    const tokenParams = gpfItineraryLayerInputSchema.parse(input);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: tokenParams,
    });

    const token = encodeToken(
      { kind: PROXY_TOKEN_KIND.itinerary, ...tokenParams },
      env.PROXY_URL_SECRET,
    );

    const dataUrl = buildDataUrl(env.PROXY_PUBLIC_BASE_URL, env.PROXY_ENDPOINT, token);

    return { data_url: dataUrl };
  }
}

export default GpfItineraryLayerTool;
