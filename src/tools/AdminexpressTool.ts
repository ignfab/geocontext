import { logger, MCPTool } from "mcp-framework";
import { z } from "zod";
import { getAdminUnits, ADMINEXPRESS_TYPES, ADMINEXPRESS_SOURCE } from "../gpf/adminexpress.js";

interface AdminexpressInput {
  lon: number;
  lat: number;
}

class AdminexpressTool extends MCPTool<AdminexpressInput> {
  name = "adminexpress";
  description = `Renvoie les unités administratives (${ADMINEXPRESS_TYPES.join(', ')}) pour une position donnée par sa longitude et sa latitude (source : ${ADMINEXPRESS_SOURCE}).`;

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

  async execute(input: AdminexpressInput) {
    logger.info(`adminexpress(${input.lon},${input.lat})...`);
    return getAdminUnits(input.lon, input.lat);
  }
}

export default AdminexpressTool;