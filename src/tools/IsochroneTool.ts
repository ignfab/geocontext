/**
 * MCP tool exposing GeoPlateforme isochrone/isodistance computation.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import {
  buildIsochroneRequest,
  getIsochrone,
  ISOCHRONE_DEFAULTS,
  ISOCHRONE_SOURCE,
  toIsochroneRequestPayload,
} from "../gpf/isochrone.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { lonSchema, latSchema } from "../helpers/schemas.js";
import { generatePublishedInputSchema } from "../helpers/jsonSchema.js";
import logger from "../logger.js";

// --- Schema ---

const isochroneConstraintSchema = z.object({
  constraint_type: z
    .literal("banned")
    .default("banned")
    .describe("Type de contrainte GeoPlateforme Valhalla. `banned` exclut du calcul les tronçons du graphe routier qui correspondent à la condition."),
  key: z
    .literal("waytype")
    .default("waytype")
    .describe("Critère de contrainte GeoPlateforme Valhalla. Seul `waytype` est exposé par `bdtopo-valhalla`."),
  operator: z
    .literal("=")
    .default("=")
    .describe("Opérateur de contrainte GeoPlateforme Valhalla. Seul `=` est exposé par `bdtopo-valhalla`."),
  value: z
    .enum(["autoroute", "pont", "tunnel"])
    .describe("Type de tronçon à exclure du calcul Valhalla."),
}).strict();

const isochroneInputSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
  cost_type: z
    .enum(["time", "distance"])
    .describe("Type de coût utilisé pour le calcul : `time` pour une isochrone, `distance` pour une isodistance."),
  cost_value: z
    .number()
    .finite()
    .positive()
    .max(50000)
    .describe("Valeur du coût utilisé pour le calcul, exprimée dans l'unité correspondante (`time_unit` ou `distance_unit`)."),
  profile: z
    .enum(["car", "pedestrian"])
    .default(ISOCHRONE_DEFAULTS.profile)
    .describe("Mode de déplacement utilisé pour le calcul. `bdtopo-valhalla` expose `car` et `pedestrian` ; aucun profil vélo n'est disponible."),
  direction: z
    .enum(["departure", "arrival"])
    .default(ISOCHRONE_DEFAULTS.direction)
    .describe("Sens du calcul : départ depuis le point ou arrivée vers le point."),
  distance_unit: z
    .enum(["meter", "kilometer"])
    .default(ISOCHRONE_DEFAULTS.distance_unit)
    .describe("Unité utilisée lorsque `cost_type=\"distance\"`."),
  time_unit: z
    .enum(["hour", "minute", "second", "standard"])
    .default(ISOCHRONE_DEFAULTS.time_unit)
    .describe("Unité utilisée lorsque `cost_type=\"time\"`."),
  constraints: z
    .array(isochroneConstraintSchema)
    .max(3)
    .default([])
    .describe("Contraintes GeoPlateforme optionnelles appliquées au calcul. Elles permettent notamment d'exclure certains types de tronçons routiers."),
  result_type: z
    .enum(["results", "request"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection GeoJSON normalisée contenant l'isochrone calculée. `request` renvoie la requête GeoPlateforme compilée (`get_url`) pour visualisation ou débogage."),
}).strict();

// --- Types ---

type IsochroneInput = z.infer<typeof isochroneInputSchema>;

const isochroneRequestOutputSchema = z.object({
  result_type: z.literal("request"),
  method: z.literal("GET"),
  url: z.string(),
  query: z.record(z.string()),
  body: z.literal(""),
  get_url: z.string(),
});

// --- Tool ---

class IsochroneTool extends BaseTool<IsochroneInput> {
  name = "isochrone";
  title = "Isochrone et isodistance";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Calcule une zone isochrone ou isodistance depuis un point `lon/lat` via le service de navigation de la Géoplateforme.",
    "La ressource GeoPlateforme est fixée à `bdtopo-valhalla`.",
    "`cost_type=\"time\"` calcule une zone accessible en un temps donné ; `cost_type=\"distance\"` calcule une zone accessible dans une distance donnée.",
    "`profile` accepte `car` ou `pedestrian` ; le service Valhalla de la Géoplateforme n'expose pas de profil vélo.",
    "Les contraintes exposées sont celles de `bdtopo-valhalla` : exclusion (`banned`) d'un `waytype` égal à `autoroute`, `pont` ou `tunnel`.",
    "`result_type=\"request\"` renvoie une requête compacte (`get_url`) cohérente avec les tools WFS en mode request.",
    "`result_type=\"results\"` renvoie une FeatureCollection GeoJSON normalisée avec une seule feature : la géométrie calculée est placée dans `geometry` et les métadonnées du service dans `properties`.",
    "Les coordonnées d'entrée sont toujours exprimées en WGS84 (`lon/lat`) ; le service est appelé avec `crs=EPSG:4326`.",
    "Aucun `feature_ref` n'est renvoyé : une isochrone est une géométrie calculée à la demande, pas un objet WFS persistant.",
    `(source : ${ISOCHRONE_SOURCE}).`
  ].join("\n");

  schema = isochroneInputSchema;

  /**
   * Exposes an MCP-compatible input schema where defaulted fields remain optional.
   *
   * @returns The published input schema exposed through the MCP tool definition.
   */
  get inputSchema() {
    return generatePublishedInputSchema(isochroneInputSchema);
  }

  /**
   * Formats request previews and normalized GeoJSON results into structured MCP content.
   *
   * @param data Raw execution result returned by the tool implementation.
   * @returns MCP success response.
   */
  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "request"
    ) {
      const payload = isochroneRequestOutputSchema.parse(data);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === "FeatureCollection"
    ) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data as Record<string, unknown>,
      };
    }

    throw new Error(
      "Réponse interne inattendue pour isochrone : le résultat devrait être une requête compilée ou une FeatureCollection.",
    );
  }

  /**
   * Computes an isochrone/isodistance or returns the compact request payload.
   *
   * @param input Normalized tool input.
   * @returns Either a compiled request or a normalized GeoJSON FeatureCollection.
   */
  async execute(input: IsochroneInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    if (input.result_type === "request") {
      return toIsochroneRequestPayload(buildIsochroneRequest(input));
    }

    return getIsochrone(input);
  }
}

export default IsochroneTool;
