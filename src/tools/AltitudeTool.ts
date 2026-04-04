import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { ALTITUDE_SOURCE, getAltitudeByLocation } from "../gpf/altitude.js";
import logger from "../logger.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";

const altitudeInputSchema = z.object({
  lon: z
    .number()
    .min(-180)
    .max(180)
    .describe("La longitude du point."),
  lat: z
    .number()
    .min(-90)
    .max(90)
    .describe("La latitude du point."),
});

type AltitudeInput = z.infer<typeof altitudeInputSchema>;

const altitudeResultSchema = z.object({
  lon: z.number().describe("La longitude du point."),
  lat: z.number().describe("La latitude du point."),
  altitude: z.number().describe("L'altitude du point."),
  accuracy: z.string().describe("L'information de précision associée à l'altitude."),
});

const altitudeOutputSchema = z.object({
  result: altitudeResultSchema.describe("Le résultat altimétrique pour la position demandée."),
});

class AltitudeTool extends MCPTool<AltitudeInput> {
  name = "altitude";
  title = "Altitude d’une position";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = `Renvoie l'altitude (en mètres) et la précision de la mesure (accuracy) d'un point géographique à partir de sa longitude et de sa latitude. (source : ${ALTITUDE_SOURCE}).`;
  protected outputSchemaShape = altitudeOutputSchema;

  schema = altitudeInputSchema;

  async execute(input: AltitudeInput) {
    logger.info(`altitude(${input.lon},${input.lat})...`);
    return {
      result: await getAltitudeByLocation(input.lon, input.lat),
    };
  }
}

export default AltitudeTool;
