/**
 * MCP tool exposing exact WFS feature lookup by `feature_id`.
 *
 * The tool keeps MCP-facing concerns such as schema exposure, compact response
 * formatting, and request-preview output. The `results` execution flow itself
 * is delegated to the structured WFS engine.
 */

import { MCPTool } from "mcp-framework";
import type { Collection } from "@ignfab/gpf-schema-store";
import { z } from "zod";

import { wfsClient } from "../gpf/wfs-schema-catalog.js";
import { generatePublishedInputSchema } from "../helpers/jsonSchema.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { buildPropertyName, executeGetFeatureById } from "../helpers/wfs_engine/byId.js";
import { buildGetFeatureByIdRequest } from "../helpers/wfs_engine/request.js";
import { gpfWfsGetFeaturesRequestOutputSchema } from "../helpers/wfs_engine/schema.js";

// --- Schema ---

const gpfWfsGetFeatureByIdInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type WFS à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`."),
  feature_id: z
    .string()
    .trim()
    .min(1, "le feature_id ne doit pas être vide")
    .describe("Identifiant WFS exact de l'objet à récupérer, par exemple `commune.8952`."),
  result_type: z
    .enum(["results", "request"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection normalisée avec exactement un objet. `request` renvoie la requête WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer. Quand `result_type=\"request\"`, la géométrie est automatiquement ajoutée."),
}).strict();

// --- Types ---

type GpfWfsGetFeatureByIdInput = z.infer<typeof gpfWfsGetFeatureByIdInputSchema>;

type PublishedInputSchema = {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
};

const gpfWfsGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeatureByIdInputSchema) as PublishedInputSchema;

// --- Tool ---

class GpfWfsGetFeatureByIdTool extends MCPTool<GpfWfsGetFeatureByIdInput> {
  name = "gpf_wfs_get_feature_by_id";
  title = "Lecture d’un objet WFS par identifiant";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Récupère exactement un objet WFS à partir de `typename` et `feature_id`, sans filtre attributaire ni spatial.",
    "Ce tool est le chemin robuste quand vous disposez déjà d'une `feature_ref { typename, feature_id }` issue d'un autre tool (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`, `gpf_wfs_get_features`).",
    "Le contrat garantit une cardinalité stricte : 0 résultat ou plusieurs résultats provoquent une erreur explicite.",
    "Utiliser `result_type=\"request\"` pour récupérer la requête WFS compilée (avec `get_url`) et l'utiliser ou la visualiser ailleurs."
  ].join("\n");

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
        structuredContent: gpfWfsGetFeaturesRequestOutputSchema.parse(data),
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
      // Keep request preview assembly local to the tool: this branch exposes
      // MCP-facing debug output rather than executing the by-id results flow.
      const featureType: Collection = await wfsClient.getFeatureType(input.typename);
      const propertyName = buildPropertyName(featureType, {
        result_type: input.result_type,
        select: input.select,
      });
      const request = buildGetFeatureByIdRequest(input.typename, input.feature_id, propertyName);

      return {
        result_type: "request" as const,
        method: request.method,
        url: request.url,
        query: request.query,
        body: request.body,
        get_url: request.get_url ?? null,
      };
    }

    return executeGetFeatureById({
      typename: input.typename,
      feature_id: input.feature_id,
      select: input.select,
    });
  }
}

export default GpfWfsGetFeatureByIdTool;
