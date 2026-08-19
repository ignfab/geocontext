/**
 * MCP tool producing an opaque, cartographiable layer URL for a Géoplateforme
 * isochrone or isodistance request.
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
  gpfIsochroneLayerInputObjectSchema,
  gpfIsochroneLayerInputSchema,
  gpfIsochroneLayerPublishedInputSchema,
  type GpfIsochroneLayerInput,
} from "../wfs/schema.js";
import { NAVIGATION_SOURCE } from "../gpf/navigation.js";
import logger from "../logger.js";

class GpfIsochroneLayerTool extends BaseTool<GpfIsochroneLayerInput> {
  name = "gpf_isochrone_layer";
  title = "Couche cartographiable d’isochrone GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie une **URL de couche cartographiable** (`data_url`) pour l'isochrone autour d'un point.",
    "Utiliser `point` pour le départ, `profile` pour le mode de déplacement et `minutes` pour fixer le seuil maximal.",
    "L'URL est opaque et doit être transmise telle quelle à un outil cartographique (MCP Carto, ...). Son ouverture renvoie une FeatureCollection GeoJSON avec la géométrie complète de l'isochrone.",
    `(source : ${NAVIGATION_SOURCE}).`,
  ].join("\n");
  protected outputSchemaShape = gpfGetFeaturesLayerOutputSchema;

  schema = gpfIsochroneLayerInputObjectSchema;

  get inputSchema() {
    return gpfIsochroneLayerPublishedInputSchema;
  }

  protected createSuccessResponse(data: unknown) {
    const payload = gpfGetFeaturesLayerOutputSchema.parse(data);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  async execute(input: GpfIsochroneLayerInput) {
    const env = getEnv();

    if (!env.PROXY_URL_SECRET || !env.PROXY_PUBLIC_BASE_URL) {
      throw new Error(
        "`gpf_isochrone_layer` nécessite un proxy geodata configuré (variables d'environnement `PROXY_URL_SECRET` et `PROXY_PUBLIC_BASE_URL`, pointant vers un proxy joignable).",
      );
    }

    const tokenParams = gpfIsochroneLayerInputSchema.parse(input);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: tokenParams,
    });

    const token = encodeToken(
      { kind: PROXY_TOKEN_KIND.isochrone, ...tokenParams },
      env.PROXY_URL_SECRET,
    );

    const dataUrl = buildDataUrl(env.PROXY_PUBLIC_BASE_URL, env.PROXY_ENDPOINT, token);

    return { data_url: dataUrl };
  }
}

export default GpfIsochroneLayerTool;