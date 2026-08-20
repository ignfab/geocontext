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
  gpfIsosurfaceLayerInputObjectSchema,
  gpfIsosurfaceLayerInputSchema,
  gpfIsosurfaceLayerPublishedInputSchema,
  type GpfIsosurfaceLayerInput,
} from "../wfs/schema.js";
import { NAVIGATION_ISOSURFACE_SOURCE } from "../gpf/navigation.js";
import logger from "../logger.js";

class GpfIsosurfaceLayerTool extends BaseTool<GpfIsosurfaceLayerInput> {
  name = "gpf_isosurface_layer";
  title = "Couche cartographiable d’isosurface GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie une **URL de couche cartographiable** (`data_url`) pour une zone de desserte calculée autour d'un point : isochrone si `cost_type = \"time\"`, isodistance si `cost_type = \"distance\"`.",
    "Utiliser `point` pour le départ, `profile` pour le mode de déplacement, `cost_type` pour choisir le type de calcul et `cost_value` pour fixer le seuil maximal (minutes si `time`, mètres si `distance`).",
    "L'URL est opaque et doit être transmise telle quelle à un outil cartographique (MCP Carto, ...). Son ouverture renvoie une FeatureCollection GeoJSON avec la géométrie complète calculée par le proxy.",
    `(source : ${NAVIGATION_ISOSURFACE_SOURCE}).`,
  ].join("\n");
  protected outputSchemaShape = gpfGetFeaturesLayerOutputSchema;

  schema = gpfIsosurfaceLayerInputObjectSchema;

  get inputSchema() {
    return gpfIsosurfaceLayerPublishedInputSchema;
  }

  protected createSuccessResponse(data: unknown) {
    const payload = gpfGetFeaturesLayerOutputSchema.parse(data);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  async execute(input: GpfIsosurfaceLayerInput) {
    const env = getEnv();

    if (!env.PROXY_URL_SECRET || !env.PROXY_PUBLIC_BASE_URL) {
      throw new Error(
        "`gpf_isosurface_layer` nécessite un proxy geodata configuré (variables d'environnement `PROXY_URL_SECRET` et `PROXY_PUBLIC_BASE_URL`, pointant vers un proxy joignable).",
      );
    }

    const tokenParams = gpfIsosurfaceLayerInputSchema.parse(input);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: tokenParams,
    });

    const token = encodeToken(
      { kind: PROXY_TOKEN_KIND.isosurface, ...tokenParams },
      env.PROXY_URL_SECRET,
    );

    const dataUrl = buildDataUrl(env.PROXY_PUBLIC_BASE_URL, env.PROXY_ENDPOINT, token);

    return { data_url: dataUrl };
  }
}

export default GpfIsosurfaceLayerTool;