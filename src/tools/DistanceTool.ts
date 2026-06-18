/**
 * MCP tool exposing distance lookup for a single geographic position.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

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
    .enum(["direct", "vincenty"])
    .default("direct")
    .describe(["Le type de chemin suivi :",
      " `direct` distance à vol d'oiseau (approximation Terre plate ou Terre ronde, précision à 0.5%),",
      " `vincenty` distance à vol d'oiseau (Terre ellipsoïde, plus précise et coûteuse, précision à 0.5mm)",
      ". Par défaut : `direct`."
    ].join(""))
}).strict();

// --- Types ---

type DistanceInput = z.infer<typeof distanceInputSchema>;

const distanceResultSchema = z.object({
  distance: z.number().describe("La distance entre les deux points, en mètres."),
});

// --- Tool ---

class DistanceTool extends BaseTool<DistanceInput> {
  name = "distance";
  title = "Distance entre deux points";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = `Renvoie la distance (en mètres) entre deux points à partir de leur longitude et latitude.`;
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
    }
  }
}

export default DistanceTool;
