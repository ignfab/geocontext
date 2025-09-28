import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { ALTITUDE_SOURCE, getAltitudeByLocation } from "../gpf/altitude.js";
import logger from "../logger.js";

interface AltitudeInput {
  lon: number;
  lat: number;
}

class AltitudeTool extends MCPTool<AltitudeInput> {
  name = "altitude";
  description = `Renvoie l'altitude pour une position donnée par sa longitude et sa latitude (source : ${ALTITUDE_SOURCE}).`;

  schema = {
    lon: {
      type: z.number(),
      description: "La longitude du point",
    },
    lat: {
      type: z.number(),
      description: "La latitude du point",
    },
  };

  async execute(input: AltitudeInput) {
    logger.info(`altitude(${input.lon},${input.lat})...`);
    return getAltitudeByLocation(input.lon, input.lat);
  }
}

export default AltitudeTool;
