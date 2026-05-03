/**
 * MCP tool exposing altitude lookup for a single geographic position.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { ALTITUDE_SOURCE, getAltitudeByLocation } from "../gpf/altitude.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { lonSchema, latSchema } from "../helpers/schemas.js";

// --- Schema ---

const altitudeInputSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
}).strict();

// --- Types ---

type AltitudeInput = z.infer<typeof altitudeInputSchema>;

const altitudeResultSchema = z.object({
  lon: z.number().describe("La longitude du point."),
  lat: z.number().describe("La latitude du point."),
  altitude: z.number().describe("L'altitude du point."),
  accuracy: z.string().describe("L'information de précision associée à l'altitude."),
});

const altitudeOutputSchema = altitudeResultSchema;

// --- Tool ---

class AltitudeTool extends BaseTool<AltitudeInput> {
  name = "altitude";
  title = "Altitude d’une position";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = `Renvoie l'altitude (en mètres) et la précision de la mesure (accuracy) d'un point géographique à partir de sa longitude et de sa latitude. (source : ${ALTITUDE_SOURCE}).`;
  protected outputSchemaShape = altitudeOutputSchema;

  schema = altitudeInputSchema;

  /**
   * Resolves the altitude information for the requested position.
   *
   * @param input Normalized tool input.
   * @returns The altitude payload returned by the upstream service.
   */
  async execute(input: AltitudeInput) {
    return await getAltitudeByLocation(input.lon, input.lat);
  }
}

export default AltitudeTool;
