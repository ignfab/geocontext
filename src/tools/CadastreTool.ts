import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { getParcellaireExpress, PARCELLAIRE_EXPRESS_TYPES, PARCELLAIRE_EXPRESS_SOURCE } from "../gpf/parcellaire-express.js";
import logger from "../logger.js";

const cadastreResultSchema = z
  .object({
    type: z.string().describe(`Le type d'objet cadastral (${PARCELLAIRE_EXPRESS_TYPES.join(", ")}).`),
    id: z.string().describe("L'identifiant de l'objet cadastral."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'objet cadastral.").optional(),
    distance: z.number().describe("La distance entre le point demandé et l'objet cadastral retenu."),
    source: z.string().describe("La source des données cadastrales."),
  })
  .catchall(z.unknown());

const cadastreOutputSchema = z.object({
  results: z.array(cadastreResultSchema).describe("La liste des objets cadastraux les plus proches du point demandé."),
});

interface CadastreInput {
  lon: number;
  lat: number;
}

class CadastreTool extends MCPTool<CadastreInput> {
  name = "cadastre";
  title = "Informations cadastrales";
  description = `Renvoie, pour un point donné par sa longitude et sa latitude, la liste des objets cadastraux (${PARCELLAIRE_EXPRESS_TYPES.join(', ')}) les plus proches, avec leurs informations associées. Les résultats sont retournés au plus une fois par type lorsqu'ils sont disponibles. (source : ${PARCELLAIRE_EXPRESS_SOURCE}).`;
  protected outputSchemaShape = cadastreOutputSchema;

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

  async execute(input: CadastreInput) {
    logger.info(`cadastre(${input.lon},${input.lat})...`);
    return {
      results: await getParcellaireExpress(input.lon, input.lat),
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

export default CadastreTool;
