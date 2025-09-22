import { logger, MCPTool } from "mcp-framework";
import { z } from "zod";
import { getParcellaireExpress, PARCELLAIRE_EXPRESS_TYPES, PARCELLAIRE_EXPRESS_SOURCE } from "../gpf/parcellaire-express.js";

interface CadastreInput {
  lon: number;
  lat: number;
}

class CadastreTool extends MCPTool<CadastreInput> {
  name = "cadastre";
  description = `Renvoie les informations cadastrales (${PARCELLAIRE_EXPRESS_TYPES.join(', ')}) pour une position donnée par sa longitude et sa latitude (source :${PARCELLAIRE_EXPRESS_SOURCE}).`;

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

  async execute(input: CadastreInput) {
    logger.info(`cadastre(${input.lon},${input.lat})...`);
    return getParcellaireExpress(input.lon, input.lat);
  }
}

export default CadastreTool;