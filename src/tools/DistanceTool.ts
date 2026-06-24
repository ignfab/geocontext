/**
 * MCP tool exposing distance lookup for a single geographic position.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { NAVIGATION_ITINERARY_SOURCE, navigationItineraryClient, ITINERARY_METRICS, ItineraryGeometryInput } from "../gpf/itinerary.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { lonSchema, latSchema } from "../helpers/schemas.js";
import logger from "../logger.js";
import { distance as distanceInternal, distanceVincenty } from "../helpers/distance.js"

// --- Schema ---

const distanceInputSchema = z.object({
  departure: z.object({
    lon: lonSchema,
    lat: latSchema,
  }).describe("Le point de départ"),
  arrival: z.object({
    lon: lonSchema,
    lat: latSchema,
  }).describe("Le point d'arrivée"),
  profile: z
    .enum(["direct", "vincenty", "pedestrian", "car"])
    .default("direct")
    .describe(["Le type de chemin suivi :",
      " `direct` distance à vol d'oiseau (approximation Terre plate ou Terre ronde, précision à 0.5%),",
      " `vincenty` distance à vol d'oiseau (Terre ellipsoïde, plus précise et coûteuse, précision à 0.5mm)",
      " `pedestrian` à pied, `car` en voiture",
      ". Par défaut : `direct`."
    ].join("")),
  shortest: z
    .enum(ITINERARY_METRICS)
    .default("time")
    .describe(["La métrique à optimiser, lorsqu'il y a un choix:",
      " `time` chemin le plus rapide,",
      " `distance` chemin le plus court.",
      " Cette option est sans effet lorsque `profile=direct` ou `vincenty`."
    ].join(""))
}).strict();

// --- Types ---

type DistanceInput = z.infer<typeof distanceInputSchema>;

const distanceResultSchema = z.object({
  distance: z.number().describe("La distance entre les deux points, en mètres."),
  time: z.number().optional().describe("Estimation du temps de trajet, en minutes. Absent si `profile`=`direct` ou `vincenty`."),
});

// --- Tool ---

class DistanceTool extends BaseTool<DistanceInput> {
  name = "distance";
  title = "Distance et temps de trajet entre deux points";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    `Renvoie la distance (en mètres) entre deux points à partir de leur longitude et latitude.`,
    `Renvoie aussi une estimation du temps de trajet dans le cas où un profil (marche, voiture) est renseigné.`,
    `(source : ${NAVIGATION_ITINERARY_SOURCE}).`,
  ].join("\n");
  protected outputSchemaShape = distanceResultSchema;

  schema = distanceInputSchema;

  /**
   * Resolves the distance query.
   *
   * @param input Normalized tool input.
   * @returns The distance.
   */
  async execute(input: DistanceInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    switch (input.profile) {
      case "direct": {
        return {
          distance: distanceInternal({
            type : "Point",
            coordinates: [input.departure.lon, input.departure.lat]
          }, {
            type : "Point",
            coordinates: [input.arrival.lon, input.arrival.lat]
          })
        }
      }
      case "vincenty": {
        return {
          distance: distanceVincenty(input.departure.lat, input.departure.lon, input.arrival.lat, input.arrival.lon)
        }
      } 
      default: {
        const itinerary = await navigationItineraryClient.getItinerary(input as ItineraryGeometryInput);
        return {
          distance: itinerary.distance,
          time: Math.floor(itinerary.duration)
        }
      }
    }
  }
}

export default DistanceTool;
