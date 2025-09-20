import { logger, MCPTool } from "mcp-framework";
import { z } from "zod";
import { getUrbanisme, URBANISME_SOURCE } from "../gpf/urbanisme.js";

interface UrbanismeInput {
  lon: number;
  lat: number;
}

class UrbanismeTool extends MCPTool<UrbanismeInput> {
  name = "urbanisme";
  description = `Renvoie les informations du document d'urbanisme (PLU, PLUi, POS, CC, PSMV) pour une position donnée par sa longitude et sa latitude (source: ${URBANISME_SOURCE}).`;

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

  async execute(input: UrbanismeInput) {
    logger.info(`urbanisme(${input.lon},${input.lat})...`);
    return getUrbanisme(input.lon, input.lat);
  }
}

export default UrbanismeTool;