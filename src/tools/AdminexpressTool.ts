import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { getAdminUnits, ADMINEXPRESS_TYPES, ADMINEXPRESS_SOURCE } from "../gpf/adminexpress.js";
import logger from "../logger.js";

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

interface AdminexpressInput {
  lon: number;
  lat: number;
}

class AdminexpressTool extends MCPTool<AdminexpressInput> {
  name = "adminexpress";
  title = "Unités administratives";
  description = `Renvoie, pour un point donné par sa longitude et sa latitude, la liste des unités administratives (${ADMINEXPRESS_TYPES.join(', ')}) qui le couvrent, sous forme d'objets typés contenant leurs propriétés administratives. (source : ${ADMINEXPRESS_SOURCE}).`;
  protected outputSchemaShape = adminexpressOutputSchema;

  schema = z.object({
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

  async execute(input: AdminexpressInput) {
    logger.info(`adminexpress(${input.lon},${input.lat})...`);
    return {
      results: await getAdminUnits(input.lon, input.lat),
    };
  }

  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "results" in data &&
      Array.isArray(data.results)
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.results),
          },
        ],
      };
    }

    return super.createSuccessResponse(data);
  }
}

export default AdminexpressTool;
