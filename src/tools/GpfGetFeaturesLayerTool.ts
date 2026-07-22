/**
 * MCP tool producing an opaque, cartographiable layer URL for a GPF query.
 *
 * Unlike `gpf_get_features` (attributes only, no geometry), this tool hands back a
 * short opaque `data_url` that the LLM passes verbatim to a map client (MCP Carto,
 * ...). Fetching it returns a full-geometry GeoJSON FeatureCollection served by the
 * stateless geodata proxy. The URL encodes the validated query params as an opaque
 * token, so the LLM can neither parse nor rebuild the underlying WFS request — this
 * is the whole point: it stops the model from reconstructing a `cql_filter` by hand
 * and bypassing geocontext's validation.
 *
 * The token is decoded by the stateless geodata proxy, a SEPARATE process
 * (src/proxy/index.ts). This tool therefore needs a REACHABLE PROXY configured —
 * the shared secret plus its public base URL — which is INDEPENDENT of the MCP's
 * own transport: a stdio MCP pointed at a locally-run proxy works exactly like the
 * http deployment. The tool is still LISTED in every transport (so `tools/list` is
 * identical everywhere) but fails fast with a clear FR error — before any WFS work
 * or token minting — when no proxy is configured.
 */

import BaseTool from "./BaseTool.js";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { getEnv } from "../config/env.js";
import { encodeToken } from "../proxy/token.js";
import { buildDataUrl } from "../proxy/dataUrl.js";
import { wfsClient } from "../wfs/execution.js";
import { compileQueryParts, getSpatialFilter } from "../wfs/queryPreparation.js";
import {
  gpfGetFeaturesLayerInputObjectSchema,
  gpfGetFeaturesLayerInputSchema,
  gpfGetFeaturesLayerOutputSchema,
  gpfGetFeaturesLayerPublishedInputSchema,
  PROXY_TOKEN_KIND,
  type GpfGetFeaturesLayerInput,
  GPF_SPATIAL_FILTER_DOCNAMES,
} from "../wfs/schema.js";
import logger from "../logger.js";

// --- Tool ---

class GpfGetFeaturesLayerTool extends BaseTool<GpfGetFeaturesLayerInput> {
  name = "gpf_get_features_layer";
  title = "Couche cartographiable d’objets GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Interroge un type GPF et renvoie une **URL de couche cartographiable** (`data_url`) : une URL opaque, à passer telle quelle à un outil d'affichage cartographique (MCP Carto, ...). L'ouvrir renvoie une FeatureCollection GeoJSON avec les géométries complètes.",
    "À utiliser dès qu'il faut **afficher / cartographier** des objets GPF. Pour des attributs sans géométrie, utiliser `gpf_get_features`.",
    `Mêmes filtres que \`gpf_get_features\` : \`select\` pour choisir les propriétés, \`where\` pour filtrer, \`order_by\` pour trier et un filtre spatial dédié (${GPF_SPATIAL_FILTER_DOCNAMES}) pour le spatial.`,
    "**OBLIGATOIRE : toujours appeler `gpf_describe_type` avant ce tool, sauf si `gpf_describe_type` a déjà été appelé pour ce même typename dans la conversation en cours.** Les noms de propriétés ne peuvent pas être devinés."
  ].join("\n");
  protected outputSchemaShape = gpfGetFeaturesLayerOutputSchema;

  // The framework requires a plain Zod object here to publish a compatible
  // input schema. Cross-field runtime validation is applied in `execute`.
  schema = gpfGetFeaturesLayerInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfGetFeaturesLayerPublishedInputSchema;
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
   * Mints the opaque proxy URL for the query.
   *
   * The tool does NOT hit the WFS itself: it encodes the validated params into an
   * opaque token and builds the absolute `data_url` the map client will fetch. The
   * proxy resolves the geometry at fetch time.
   *
   * @param input Normalized tool input.
   * @returns An object carrying the opaque `data_url`.
   */
  async execute(input: GpfGetFeaturesLayerInput) {
    const env = getEnv();

    // Gate on CONFIGURATION, not on TRANSPORT_TYPE: the tool only yields a working
    // URL when a reachable proxy is configured (shared secret + public base URL),
    // and the proxy is a separate process, so this is independent of whether the MCP
    // itself runs in stdio or http — a stdio MCP pointed at a locally-run proxy works
    // too. Fail fast BEFORE any WFS/token work, and steer toward the geometry-less
    // fallback tool when no proxy is configured.
    if (!env.PROXY_URL_SECRET || !env.PROXY_PUBLIC_BASE_URL) {
      throw new Error(
        "`gpf_get_features_layer` nécessite un proxy geodata configuré (variables d'environnement `PROXY_URL_SECRET` et `PROXY_PUBLIC_BASE_URL`, pointant vers un proxy joignable). Sans proxy configuré, utiliser `gpf_get_features` (attributs, sans géométrie).",
      );
    }

    // Validate the input the same way the proxy will re-validate the decoded token,
    // and encode exactly that object shape so the round-trip is symmetric (the
    // proxy parses the token through the strict object schema).
    const tokenParams = gpfGetFeaturesLayerInputObjectSchema.parse(input);
    // Run the transform+refinement (single spatial filter, spatial_extras default)
    // so the caller gets a clean validation error rather than a proxy-side rejection.
    const compiledInput = gpfGetFeaturesLayerInputSchema.parse(input);

    // Semantic pre-flight (P2): validate the query against the EMBEDDED catalog
    // BEFORE minting the URL, so a bad typename/select/where/order_by fails at THIS
    // tool call (where the LLM can fix it) instead of surfacing as an opaque proxy
    // 5xx only when the map client later fetches the data_url. getFeatureType and
    // compileQueryParts are network-free (embedded catalog).
    const featureType = await wfsClient.getFeatureType(compiledInput.typename);
    const spatialFilter = getSpatialFilter(compiledInput);

    // Also validate the reference feature's typename for an intersects_feature
    // filter — it is a SECOND typename the proxy would resolve at fetch time
    // (execute.ts resolveReferenceGeometry), and an unknown one would otherwise
    // surface only as a proxy 5xx. Its `feature_id` cannot be checked here (that IS
    // a network lookup); only the typename's existence is validated locally.
    if (spatialFilter?.operator === "intersects_feature") {
      await wfsClient.getFeatureType(spatialFilter.typename);
    }

    // We must NOT resolve the reference geometry for intersects_feature/travel_time
    // (that IS a network call) — those geometries resolve at fetch time on the
    // proxy — so we pass a placeholder ref just to let compileQueryParts validate
    // the attribute side (select/where/order_by).
    const needsResolvedRef =
      spatialFilter?.operator === "intersects_feature" || spatialFilter?.operator === "travel_time";
    compileQueryParts(
      compiledInput,
      featureType,
      needsResolvedRef ? { geometry_ewkt: "SRID=4326;POINT(0 0)" } : undefined,
    );

    logger.info(`[tool] execute ${this.name} ...`, {
      input: tokenParams,
    });

    // Tag the token with the query discriminant so the two-producer proxy dispatches
    // it to the layer-query engine. The `kind` is injected here from validated
    // params, never taken from tool input.
    //
    // encodeToken may throw a typed ProxyToken* error (EN message). We let it
    // propagate: BaseTool.createErrorResponse -> normalizeToolError translates it
    // to a FR payload with a stable code (translation lives at the tool boundary).
    const token = encodeToken(
      { kind: PROXY_TOKEN_KIND.query, ...tokenParams },
      env.PROXY_URL_SECRET,
    );

    // Append the endpoint to the public base so an ingress path prefix is preserved
    // (see buildDataUrl — `new URL(endpoint, base)` would drop it and 404).
    const dataUrl = buildDataUrl(env.PROXY_PUBLIC_BASE_URL, env.PROXY_ENDPOINT, token);

    return { data_url: dataUrl };
  }
}

export default GpfGetFeaturesLayerTool;
