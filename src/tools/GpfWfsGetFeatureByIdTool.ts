import { MCPTool } from "mcp-framework";
import type { Collection } from "@ignfab/gpf-schema-store";
import { z } from "zod";

import { wfsClient } from "../gpf/wfs.js";
import { fetchJSONPost } from "../helpers/http.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { generatePublishedInputSchema } from "../helpers/jsonSchema.js";
import { compileSelectProperty, getGeometryProperty } from "../helpers/wfs_internal/compile.js";
import { buildGetFeatureByIdRequest, type CompiledRequest } from "../helpers/wfs_internal/request.js";
import { attachFeatureRefs } from "../helpers/wfs_internal/response.js";
import { gpfWfsGetFeaturesRequestOutputSchema } from "../helpers/wfs_internal/schema.js";

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

type GpfWfsGetFeatureByIdInput = z.infer<typeof gpfWfsGetFeatureByIdInputSchema>;

type PublishedInputSchema = {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
};

const gpfWfsGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeatureByIdInputSchema) as PublishedInputSchema;

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
   * Loads a WFS feature type description from the embedded catalog.
   *
   * @param typename Exact WFS typename to load from the embedded schema store.
   * @returns The matching feature type description.
   */
  protected async getFeatureType(typename: string) {
    return wfsClient.getFeatureType(typename);
  }

  /**
   * Executes a compiled WFS request as POST and returns the JSON FeatureCollection.
   *
   * @param request Compiled request split into query-string parameters and POST body.
   * @returns The parsed JSON response returned by the WFS endpoint.
   */
  protected async fetchFeatureCollection(request: CompiledRequest) {
    const url = `${request.url}?${new URLSearchParams(request.query).toString()}`;
    return fetchJSONPost(url, request.body, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    });
  }

  /**
   * Builds the optional `propertyName` request parameter from `select`.
   *
   * @param featureType Feature type definition loaded from the embedded catalog.
   * @param input Normalized tool input.
   * @returns A comma-separated property list, or `undefined` when all properties should be returned.
   */
  protected buildPropertyName(featureType: Collection, input: GpfWfsGetFeatureByIdInput) {
    if (!input.select || input.select.length === 0) {
      return undefined;
    }

    const geometryProperty = getGeometryProperty(featureType);
    const selectedProperties = input.select.map((propertyName) => compileSelectProperty(featureType, geometryProperty, propertyName));

    if (input.result_type === "request") {
      return [...selectedProperties, geometryProperty.name].join(",");
    }

    return selectedProperties.join(",");
  }

  /**
   * Orchestrates the by-id execution flow:
   * schema lookup -> request compilation -> optional request output -> WFS execution -> cardinality validation.
   *
   * @param input Normalized tool input.
   * @returns Either a compiled request or a transformed FeatureCollection containing one feature.
   */
  async execute(input: GpfWfsGetFeatureByIdInput) {
    const featureType: Collection = await this.getFeatureType(input.typename);
    const propertyName = this.buildPropertyName(featureType, input);
    const request = buildGetFeatureByIdRequest(input.typename, input.feature_id, propertyName);

    if (input.result_type === "request") {
      return {
        result_type: "request" as const,
        method: request.method,
        url: request.url,
        query: request.query,
        body: request.body,
        get_url: request.get_url ?? null,
      };
    }

    const featureCollection = await this.fetchFeatureCollection(request);
    if (!Array.isArray(featureCollection?.features)) {
      throw new Error("Le service WFS n'a pas retourné de collection d'objets exploitable.");
    }

    if (featureCollection.features.length === 0) {
      throw new Error(`Le feature '${input.feature_id}' est introuvable dans '${input.typename}'.`);
    }

    if (featureCollection.features.length > 1) {
      throw new Error(`Le feature '${input.feature_id}' dans '${input.typename}' devrait être unique, mais ${featureCollection.features.length} objets ont été retournés.`);
    }

    const [firstFeature] = featureCollection.features;
    if (firstFeature?.id !== input.feature_id) {
      throw new Error(`Le service WFS a retourné l'identifiant '${String(firstFeature?.id)}' au lieu de '${input.feature_id}'.`);
    }

    const singleFeatureCollection = {
      ...featureCollection,
      features: [firstFeature],
      totalFeatures: 1,
      numberReturned: 1,
      numberMatched: 1,
    };

    return attachFeatureRefs(singleFeatureCollection, input.typename);
  }
}

export default GpfWfsGetFeatureByIdTool;
