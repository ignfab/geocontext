import { logger, MCPTool } from "mcp-framework";
import { z } from "zod";
import { getUrbanisme, URBANISME_SOURCE } from "../gpf/urbanisme.js";

interface UrbanismeInput {
  lon: number;
  lat: number;
}

const URBANISME_TOOL_DESCRIPTION = [
  `Renvoie les informations du document d'urbanisme (PLU, PLUi, POS, CC, PSMV) pour une position donnee par sa longitude et sa latitude (source: ${URBANISME_SOURCE}).`,
  "Modeles d'URL Geoportail Urbanisme:",
  "- fiche document: https://www.geoportail-urbanisme.gouv.fr/document/by-id/{gpu_doc_id}",
  "- carte: https://www.geoportail-urbanisme.gouv.fr/map/?documentId={gpu_doc_id}",
  "- fichier: https://www.geoportail-urbanisme.gouv.fr/api/document/{gpu_doc_id}/files/{nomfic}",
].join("\n");

class UrbanismeTool extends MCPTool<UrbanismeInput> {
  name = "urbanisme";
  description = URBANISME_TOOL_DESCRIPTION;

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