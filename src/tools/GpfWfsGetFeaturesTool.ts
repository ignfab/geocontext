import { MCPTool } from "mcp-framework";
import type { Collection } from "@ignfab/gpf-schema-store";

import { wfsClient } from "../gpf/wfs-schema-catalog.js";
import { fetchJSONPost } from "../helpers/http.js";
import logger from "../logger.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { compileQueryParts, geometryToEwkt, getGeometryProperty, getSpatialFilter } from "../helpers/wfs_engine/compile.js";
import { buildMainRequest, buildReferenceGeometryRequest, type CompiledRequest } from "../helpers/wfs_engine/request.js";
import { attachFeatureRefs } from "../helpers/wfs_engine/response.js";
import {
  gpfWfsGetFeaturesHitsOutputSchema,
  gpfWfsGetFeaturesInputSchema,
  type GpfWfsGetFeaturesInput,
  gpfWfsGetFeaturesPublishedInputSchema,
  gpfWfsGetFeaturesRequestOutputSchema,
} from "../helpers/wfs_engine/schema.js";

class GpfWfsGetFeaturesTool extends MCPTool<GpfWfsGetFeaturesInput> {
  name = "gpf_wfs_get_features";
  title = "Lecture d’objets WFS";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Interroge un type WFS et renvoie des résultats structurés sans demander au modèle d'écrire du CQL ou du WFS.",
    "Utiliser `select` pour choisir les propriétés, `where` pour filtrer, `order_by` pour trier et `spatial_operator` avec ses paramètres dédiés pour le spatial. Avec `result_type=\"request\"`, la géométrie est automatiquement ajoutée aux propriétés sélectionnées pour garantir une requête cartographiable.",
    "Exemple attributaire : `where=[{ property: \"code_insee\", operator: \"eq\", value: \"75056\" }]`.",
    "Exemple bbox : `spatial_operator=\"bbox\"` avec `bbox_west`, `bbox_south`, `bbox_east`, `bbox_north` en `lon/lat`.",
    "Exemple distance : `spatial_operator=\"dwithin_point\"` avec `dwithin_lon`, `dwithin_lat`, `dwithin_distance_m`.",
    "Exemple réutilisation : `spatial_operator=\"intersects_feature\"` avec `intersects_feature_typename` et `intersects_feature_id` issus d'une `feature_ref`.",
    "⚠️ Quand `typename` et `intersects_feature_typename` sont identiques, utiliser `gpf_wfs_get_feature_by_id` pour récupérer exactement l'objet ciblé.",
    "**OBLIGATOIRE : toujours appeler `gpf_wfs_describe_type` avant ce tool, sauf si `gpf_wfs_describe_type` a déjà été appelé pour ce même typename dans la conversation en cours.**",
    "Les noms de propriétés **ne peuvent pas être devinés** : ils sont spécifiques à chaque typename et diffèrent systématiquement des conventions habituelles (ex : pas de nom_officiel, navigabilite sans accent, etc.). Toute tentative sans appel préalable à `gpf_wfs_describe_type` **provoquera une erreur.**"
  ].join("\n");

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
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data.totalFeatures) }],
        structuredContent: gpfWfsGetFeaturesHitsOutputSchema.parse(data),
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
   * Extracts a result count from a WFS response, preferring `numberMatched`.
   * Explicitly rejects responses that do not provide a usable total.
   *
   * @param featureCollection Parsed WFS response object.
   * @returns The total number of matching features.
   */
  protected getMatchedFeatureCount(featureCollection: Record<string, unknown>) {
    if (typeof featureCollection.numberMatched === "number") {
      return featureCollection.numberMatched;
    }
    if (featureCollection.numberMatched === "unknown") {
      throw new Error("Le service WFS a renvoyé un comptage indéterminé (numberMatched=\"unknown\").");
    }
    if (typeof featureCollection.totalFeatures === "number") {
      return featureCollection.totalFeatures;
    }
    throw new Error("Le service WFS n'a pas retourné de comptage exploitable");
  }

  /**
   * Resolves the geometry of a reference feature when `intersects_feature` is used,
   * then converts it to EWKT for CQL compilation.
   *
   * @param input Normalized tool input.
   * @returns The resolved reference geometry, or `undefined` when no reference feature is needed.
   */
  protected async resolveIntersectsFeatureGeometry(input: GpfWfsGetFeaturesInput) {
    const spatialFilter = getSpatialFilter(input);
    if (!spatialFilter || spatialFilter.operator !== "intersects_feature") {
      return undefined;
    }

    const referenceFeatureType = await this.getFeatureType(spatialFilter.typename);
    const referenceGeometryProperty = getGeometryProperty(referenceFeatureType);
    const request = buildReferenceGeometryRequest(
      spatialFilter.typename,
      spatialFilter.feature_id,
      referenceGeometryProperty.name
    );
    const featureCollection = await this.fetchFeatureCollection(request);
    const referenceFeature = Array.isArray(featureCollection?.features) ? featureCollection.features[0] : undefined;
    if (!referenceFeature) {
      throw new Error(`Le feature de référence '${spatialFilter.feature_id}' est introuvable dans '${spatialFilter.typename}'.`);
    }
    if (!referenceFeature?.geometry) {
      throw new Error(`Le feature de référence '${spatialFilter.feature_id}' n'a pas de géométrie exploitable.`);
    }

    return {
      typename: spatialFilter.typename,
      feature_id: spatialFilter.feature_id,
      geometry_ewkt: geometryToEwkt(referenceFeature.geometry),
    };
  }

  /**
   * Orchestrates the full tool execution flow:
   * catalog lookup -> compilation -> WFS request -> response post-processing.
   *
   * @param input Normalized tool input.
   * @returns Either a compiled request, a hit count, or a transformed FeatureCollection.
   */
  async execute(input: GpfWfsGetFeaturesInput) {
    if (
      input.spatial_operator === "intersects_feature" &&
      input.intersects_feature_typename !== undefined &&
      input.typename === input.intersects_feature_typename
    ) {
      throw new Error(
        "Le filtre `intersects_feature` sur le même `typename` retourne potentiellement plusieurs objets. " +
        "Utiliser `gpf_wfs_get_feature_by_id` avec `{ typename, feature_id: intersects_feature_id }` pour cibler exactement un objet."
      );
    }

    const featureType: Collection = await this.getFeatureType(input.typename);
    const resolvedGeometryRef = await this.resolveIntersectsFeatureGeometry(input);
    const compiled = compileQueryParts(input, featureType, resolvedGeometryRef);
    const request = buildMainRequest(input, compiled);

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

    let featureCollection: any;
    try {
      logger.info(`[gpf_wfs_get_features] POST ${request.url}?${new URLSearchParams(request.query).toString()}`);
      featureCollection = await this.fetchFeatureCollection(request);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(`Illegal property name: ${compiled.geometryProperty.name}`)) {
        throw new Error(`Le champ géométrique '${compiled.geometryProperty.name}' issu du catalogue embarqué est rejeté par le WFS live pour '${input.typename}'. Le catalogue embarqué est probablement désynchronisé. Détail : ${message}`);
      }
      throw error;
    }

    if (input.result_type === "hits") {
      return {
        result_type: "hits" as const,
        totalFeatures: this.getMatchedFeatureCount(featureCollection),
      };
    }

    return attachFeatureRefs(featureCollection, input.typename);
  }
}

export default GpfWfsGetFeaturesTool;
