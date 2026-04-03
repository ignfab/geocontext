import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { getAssiettesServitudes, URBANISME_SOURCE } from "../gpf/urbanisme.js";
import logger from "../logger.js";

interface SupInput {
  lon: number;
  lat: number;
}

const assietteSupResultSchema = z
  .object({
    type: z.string().describe("Le type d'assiette de servitude d'utilité publique renvoyé."),
    id: z.string().describe("L'identifiant de l'assiette."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'assiette.").optional(),
    distance: z.number().describe("La distance entre le point demandé et l'assiette retenue."),
  })
  .catchall(z.unknown());

const assietteSupOutputSchema = z.object({
  results: z.array(assietteSupResultSchema).describe("La liste des assiettes de servitudes d'utilité publique pertinentes pour le point demandé."),
});

class AssietteSupTool extends MCPTool<SupInput> {
  name = "assiette_sup";
  title = "Servitudes d’utilité publique";
  description = `Renvoie, pour un point donné par sa longitude et sa latitude, la liste des assiettes de servitudes d'utilité publique (SUP) pertinentes à proximité, avec leurs propriétés associées. Les résultats peuvent inclure des assiettes ponctuelles, linéaires ou surfaciques. (source : ${URBANISME_SOURCE}).`;
  protected outputSchemaShape = assietteSupOutputSchema;

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

  async execute(input: SupInput) {
    logger.info(`assiette_sup(${input.lon},${input.lat})...`);
    return {
      results: await getAssiettesServitudes(input.lon, input.lat),
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

export default AssietteSupTool;
