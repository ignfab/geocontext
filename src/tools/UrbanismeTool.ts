import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { getUrbanisme, URBANISME_SOURCE } from "../gpf/urbanisme.js";
import logger from "../logger.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "./toolAnnotations.js";

const urbanismeInputSchema = z.object({
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

type UrbanismeInput = z.infer<typeof urbanismeInputSchema>;

const urbanismeResultSchema = z
  .object({
    type: z.string().describe("Le type d'objet d'urbanisme renvoyé."),
    id: z.string().describe("L'identifiant de l'objet d'urbanisme."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'objet d'urbanisme.").optional(),
    distance: z.number().describe("La distance entre le point demandé et l'objet d'urbanisme retenu."),
  })
  .catchall(z.unknown());

const urbanismeOutputSchema = z.object({
  results: z.array(urbanismeResultSchema).describe("La liste des objets d'urbanisme pertinents pour le point demandé."),
});

const URBANISME_TOOL_DESCRIPTION = [
  `Renvoie, pour un point donné par sa longitude et sa latitude, la liste des objets d'urbanisme pertinents du Géoportail de l'Urbanisme (document, zones, prescriptions, informations, etc.), avec leurs propriétés associées. (source : ${URBANISME_SOURCE}).`,
  "Les résultats peuvent notamment inclure le document d'urbanisme applicable ainsi que des éléments réglementaires associés à proximité du point.",
  "Modèles d'URL Géoportail de l'Urbanisme :",
  "- fiche document: https://www.geoportail-urbanisme.gouv.fr/document/by-id/{gpu_doc_id}",
  "- carte: https://www.geoportail-urbanisme.gouv.fr/map/?documentId={gpu_doc_id}",
  "- fichier: https://www.geoportail-urbanisme.gouv.fr/api/document/{gpu_doc_id}/files/{nomfic}",
].join("\n");


class UrbanismeTool extends MCPTool<UrbanismeInput> {
  name = "urbanisme";
  title = "Informations d’urbanisme";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = URBANISME_TOOL_DESCRIPTION;
  protected outputSchemaShape = urbanismeOutputSchema;

  schema = urbanismeInputSchema;

  async execute(input: UrbanismeInput) {
    logger.info(`urbanisme(${input.lon},${input.lat})...`);
    return {
      results: await getUrbanisme(input.lon, input.lat),
    };
  }
}

export default UrbanismeTool;
