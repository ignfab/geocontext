import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { getAdminUnits, ADMINEXPRESS_TYPES, ADMINEXPRESS_SOURCE } from "../gpf/adminexpress.js";
import logger from "../logger.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";

const adminexpressInputSchema = z.object({
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
}).strict();

type AdminexpressInput = z.infer<typeof adminexpressInputSchema>;

const adminexpressResultSchema = z
  .object({
    type: z.string().describe(`Le type d'unité administrative (${ADMINEXPRESS_TYPES.join(", ")}).`),
    id: z.string().describe("L'identifiant de l'unité administrative."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'unité administrative.").optional(),
  })
  .catchall(z.unknown());

const adminexpressOutputSchema = z.object({
  results: z.array(adminexpressResultSchema).describe("La liste des unités administratives couvrant le point demandé."),
});

class AdminexpressTool extends MCPTool<AdminexpressInput> {
  name = "adminexpress";
  title = "Unités administratives";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = `Renvoie, pour un point donné par sa longitude et sa latitude, la liste des unités administratives (${ADMINEXPRESS_TYPES.join(', ')}) qui le couvrent, sous forme d'objets typés contenant leurs propriétés administratives. (source : ${ADMINEXPRESS_SOURCE}).`;
  protected outputSchemaShape = adminexpressOutputSchema;

  schema = adminexpressInputSchema;

  async execute(input: AdminexpressInput) {
    logger.info(`adminexpress(${input.lon},${input.lat})...`);
    return {
      results: await getAdminUnits(input.lon, input.lat),
    };
  }
}

export default AdminexpressTool;
