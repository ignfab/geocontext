import { logger, MCPTool } from "mcp-framework";
import { z } from "zod";
import { getAssiettesServitudes, URBANISME_SOURCE } from "../gpf/urbanisme.js";

interface SupInput {
  lon: number;
  lat: number;
}

class AssietteSupTool extends MCPTool<SupInput> {
  name = "assiette_sup";
  description = `Renvoie les assiettes des servitudes d'utilité publique (SUP) pour une position donnée par sa longitude et sa latitude (source: ${URBANISME_SOURCE}).`;

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

  async execute(input: SupInput) {
    logger.info(`assiette_sup(${input.lon},${input.lat})...`);
    return getAssiettesServitudes(input.lon, input.lat);
  }
}

export default AssietteSupTool;