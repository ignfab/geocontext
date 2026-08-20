/**
 * MCP tool producing an opaque, cartographiable layer URL for a Géoplateforme
 * isochrone request.
 *
 * The tool returns a short opaque `data_url` that the LLM passes verbatim to a
 * map client. Fetching it yields a GeoJSON FeatureCollection served by the
 * stateless geodata proxy. The URL encodes the validated request params as an
 * opaque token, so the LLM can neither parse nor rebuild the underlying
 * upstream request.
 */

import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { getEnv } from "../config/env.js";
import { encodeToken } from "../proxy/token.js";
import { buildDataUrl } from "../proxy/dataUrl.js";
import {
  PROXY_TOKEN_KIND,
  gpfGetFeaturesLayerOutputSchema,
  gpfIsolineLayerInputObjectSchema,
  gpfIsolineLayerInputSchema,
  gpfIsolineLayerPublishedInputSchema,
  type GpfIsolineLayerInput,
} from "../wfs/schema.js";
import { NAVIGATION_SOURCE } from "../gpf/navigation.js";
import logger from "../logger.js";

// --- Tool ---

class GpfIsolineLayerTool extends BaseTool<GpfIsolineLayerInput> {
  name = "gpf_isoline_layer";
  title = "Couche cartographiable d’isoline GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie une **URL de couche cartographiable** (`data_url`) pour l'isochrone autour d'un point.",
    "Utiliser `lon`/`lat` pour le départ, `profile` pour le mode de déplacement et `minutes` pour fixer le seuil maximal.",
    "L'URL est opaque et doit être transmise telle quelle à un outil cartographique (MCP Carto, ...). Son ouverture renvoie une FeatureCollection portant la géométrie complète de l'isochrone.",
    `(source : ${NAVIGATION_SOURCE}).`,
  ].join("\n");
  protected outputSchemaShape = gpfGetFeaturesLayerOutputSchema;

  // The framework requires a plain Zod object here to publish a compatible input
  // schema. `execute` re-parses through `gpfIsolineLayerInputSchema` so any
  // cross-field refinement still runs before a token is minted.
  schema = gpfIsolineLayerInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfIsolineLayerPublishedInputSchema;
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
   * Mints the opaque proxy URL for the requested isochrone. No upstream call is
   * made here: the isochrone itself is computed by the proxy when the `data_url`
   * is fetched.
   *
   * @param input Validated isochrone layer input.
   * @returns The `{ data_url }` payload carrying the opaque token.
   */
  async execute(input: GpfIsolineLayerInput) {
    const env = getEnv();

    if (!env.PROXY_URL_SECRET || !env.PROXY_PUBLIC_BASE_URL) {
      throw new Error(
        "`gpf_isoline_layer` nécessite un proxy geodata configuré (variables d'environnement `PROXY_URL_SECRET` et `PROXY_PUBLIC_BASE_URL`, pointant vers un proxy joignable).",
      );
    }

    const tokenParams = gpfIsolineLayerInputSchema.parse(input);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: tokenParams,
    });

    const token = encodeToken(
      { kind: PROXY_TOKEN_KIND.isoline, ...tokenParams },
      env.PROXY_URL_SECRET,
    );

    const dataUrl = buildDataUrl(env.PROXY_PUBLIC_BASE_URL, env.PROXY_ENDPOINT, token);

    return { data_url: dataUrl };
  }
}

export default GpfIsolineLayerTool;
