/**
 * MCP tool producing an opaque, cartographiable layer URL for exactly ONE GPF
 * feature identified by its `feature_id`.
 *
 * This is the map-layer counterpart of `gpf_get_feature_by_id`: where that tool
 * returns the feature's attributes (geometry stripped), this one hands back a
 * short opaque `data_url` the LLM passes verbatim to a map client (MCP Carto,
 * ...). Fetching it returns a full-geometry GeoJSON FeatureCollection with the
 * single matching feature, served by the stateless geodata proxy.
 *
 * The surface is deliberately STRICT: `{ typename, feature_id, select? }`. There
 * is no attribute or spatial filter here by design — a by-id lookup targets one
 * known object. `select` only reduces non-geometric properties; the catalog
 * geometry column is always retained. The URL encodes those validated params as
 * an opaque token, so the LLM can neither parse nor rebuild the underlying WFS
 * request. Even though a by-id URL is always short, it stays opaque on purpose:
 * the goal is to hide WFS syntax from the model, not merely to keep URLs short.
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
import { buildPropertyNameWithGeometry } from "../wfs/properties.js";
import {
  PROXY_TOKEN_KIND,
  gpfGetFeatureByIdLayerInputObjectSchema,
  gpfGetFeatureByIdLayerPublishedInputSchema,
  gpfGetFeaturesLayerOutputSchema,
  type GpfGetFeatureByIdLayerInput,
} from "../wfs/schema.js";
import logger from "../logger.js";

// --- Tool ---

class GpfGetFeatureByIdLayerTool extends BaseTool<GpfGetFeatureByIdLayerInput> {
  name = "gpf_get_feature_by_id_layer";
  title = "Couche cartographiable d’un objet GPF par identifiant";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie une **URL de couche cartographiable** (`data_url`) pour exactement un objet GPF, identifié par `typename` et `feature_id` : une URL opaque, à passer telle quelle à un outil d'affichage cartographique (MCP Carto, ...). L'ouvrir renvoie une FeatureCollection GeoJSON contenant le seul objet demandé, avec sa géométrie complète.",
    "C'est le pendant cartographique de `gpf_get_feature_by_id` : utiliser ce tool dès qu'il faut **afficher / cartographier** un objet précis dont on connaît déjà la `feature_ref { typename, feature_id }` (issue d'un autre tool : `adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_get_features`). Pour récupérer ses attributs sans géométrie, utiliser `gpf_get_feature_by_id`.",
    "Utiliser `select` pour limiter les propriétés attributaires retournées.",
    "Aucun filtre attributaire ni spatial n'est accepté : ce tool cible un objet unique par son identifiant, utiliser `gpf_get_features_layer` pour cibler des objets par filtrage.",
    "Cet outil ne peut renvoyer qu'un unique objet (0 ou plusieurs résultats provoquent une erreur explicite).",
  ].join("\n");
  protected outputSchemaShape = gpfGetFeaturesLayerOutputSchema;

  // The framework requires a plain Zod object here to publish a compatible input
  // schema. This by-id surface has no cross-field refinement (no filters, so no
  // single-spatial-filter rule to enforce), so the object schema is the full
  // runtime contract. `select` is validated against the catalog in execute().
  schema = gpfGetFeatureByIdLayerInputObjectSchema;

  /**
   * Exposes an input schema variant that stays compatible with most MCP integrations.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return gpfGetFeatureByIdLayerPublishedInputSchema;
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
   * Mints the opaque proxy URL for the single-feature lookup.
   *
   * The tool does NOT hit the WFS itself: it encodes the validated params —
   * tagged with the by-id discriminant so the proxy dispatches to its
   * single-feature path — into an opaque token and builds the absolute
   * `data_url` the map client will fetch. The proxy resolves the geometry at
   * fetch time.
   *
   * @param input Normalized tool input.
   * @returns An object carrying the opaque `data_url`.
   */
  async execute(input: GpfGetFeatureByIdLayerInput) {
    const env = getEnv();

    // Gate on CONFIGURATION, not on TRANSPORT_TYPE (see gpf_get_features_layer): the
    // tool only yields a working URL when a reachable proxy is configured (shared
    // secret + public base URL), which is independent of the MCP's own transport —
    // a stdio MCP pointed at a locally-run proxy works too. Fail fast BEFORE any
    // WFS/token work, and steer toward the geometry-less fallback tool.
    if (!env.PROXY_URL_SECRET || !env.PROXY_PUBLIC_BASE_URL) {
      throw new Error(
        "`gpf_get_feature_by_id_layer` nécessite un proxy geodata configuré (variables d'environnement `PROXY_URL_SECRET` et `PROXY_PUBLIC_BASE_URL`, pointant vers un proxy joignable). Sans proxy configuré, utiliser `gpf_get_feature_by_id` (attributs, sans géométrie).",
      );
    }

    // Validate the input the same way the proxy will re-validate the decoded token,
    // and encode exactly that object shape so the round-trip is symmetric (the
    // proxy parses the token through the strict object schema).
    const tokenParams = gpfGetFeatureByIdLayerInputObjectSchema.parse(input);

    // Semantic pre-flight (network-free): validate the typename, selected
    // non-geometric properties and geometry invariant against the EMBEDDED catalog
    // BEFORE minting the URL, so a bad selection fails at THIS tool call rather
    // than as an opaque proxy error when the map client fetches the URL.
    // The `feature_id` cannot be validated here — that is a network lookup resolved
    // at fetch time by the proxy (runGeometryFeatureByIdQuery).
    const featureType = await wfsClient.getFeatureType(tokenParams.typename);
    buildPropertyNameWithGeometry(featureType, tokenParams.select);

    logger.info(`[tool] execute ${this.name} ...`, {
      input: tokenParams,
    });

    // Tag the token with the by-id discriminant so the single-token, two-producer
    // proxy can dispatch a by-id token to its single-feature path instead of the
    // generic query path. The discriminant is server-controlled, not an LLM knob:
    // it is injected here from the parsed params, never taken from tool input.
    //
    // encodeToken may throw a typed ProxyToken* error (EN message). We let it
    // propagate: BaseTool.createErrorResponse -> normalizeToolError translates it
    // to a FR payload with a stable code (translation lives at the tool boundary).
    const token = encodeToken(
      { kind: PROXY_TOKEN_KIND.byId, ...tokenParams },
      env.PROXY_URL_SECRET,
    );

    // Append the endpoint to the public base so an ingress path prefix is preserved
    // (see buildDataUrl — `new URL(endpoint, base)` would drop it and 404).
    const dataUrl = buildDataUrl(env.PROXY_PUBLIC_BASE_URL, env.PROXY_ENDPOINT, token);

    return { data_url: dataUrl };
  }
}

export default GpfGetFeatureByIdLayerTool;
