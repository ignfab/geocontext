import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { geocode } from "../gpf/geocode.js";

import logger from "../logger.js";

interface GeocodeInput {
  text: string;
}

class GeocodeTool extends MCPTool<GeocodeInput> {
  name = "geocode";
  description = "Renvoie les coordonnées (lon,lat) d'un lieu en complétant les informations.";

  schema = {
    text: {
      type: z.string(),
      description: "Le texte devant être completé et géocodé",
    },
  };

  async execute(input: GeocodeInput) {
    logger.info(`geocode(${input.text})...`);
    return geocode(input.text);
  }
}

export default GeocodeTool;