/**
 * MCP tool exposing altitude lookup for a single geographic position.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { ALTITUDE_SOURCE, altitudeClient } from "../gpf/altitude.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { buildLonLatSchema } from "../helpers/schemas.js";
import logger from "../logger.js";

// --- Schemas ---

const altitudeInputSchema = buildLonLatSchema();

const altitudeOutputSchema = z.object({
  lon: z.number().describe("La longitude du point."),
  lat: z.number().describe("La latitude du point."),
  altitude: z.number().describe("L'altitude du point."),
  accuracy: z.string().describe("L'information de précision associée à l'altitude."),
});

// --- Types ---

type AltitudeInput = z.infer<typeof altitudeInputSchema>;

// --- Tool ---

const ALTITUDE_TOOL_DESCRIPTION = `Renvoie l'altitude (en mètres) et la précision de la mesure (accuracy) d'un point géographique à partir de sa longitude et de sa latitude. (source : ${ALTITUDE_SOURCE}).`;

class AltitudeTool extends BaseTool<AltitudeInput> {
  name = "altitude";
  title = "Altitude d'une position";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = ALTITUDE_TOOL_DESCRIPTION;
  protected outputSchemaShape = altitudeOutputSchema;

  schema = altitudeInputSchema;

  /**
   * Resolves the altitude information for the requested position.
   *
   * @param input Normalized tool input.
   * @returns The altitude payload returned by the upstream service.
   */
  async execute(input: AltitudeInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    return await altitudeClient.getByLocation(input.lon, input.lat);
  }
}

export default AltitudeTool;
