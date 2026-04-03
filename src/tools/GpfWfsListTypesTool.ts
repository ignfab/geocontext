import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { wfsClient } from "../gpf/wfs.js";

const gpfWfsListTypeResultSchema = z.object({
  id: z.string().describe("L'identifiant complet du type WFS."),
  title: z.string().describe("Le titre lisible du type WFS."),
  description: z.string().describe("La description du type WFS."),
});

const gpfWfsListTypesOutputSchema = z.object({
  results: z.array(gpfWfsListTypeResultSchema).describe("La liste complète des types WFS disponibles."),
});

interface WfsTypesInput {}

class GpfWfsListTypesTools extends MCPTool<WfsTypesInput> {
  name = "gpf_wfs_list_types";
  title = "Liste complète des types WFS";
  description = [
    "Renvoie la liste complète des types WFS de la Géoplateforme (GPF).",
    "Utiliser ce tool pour un inventaire exhaustif ou une exploration globale du catalogue.",
    "Pour trouver rapidement un type pertinent à partir de mots-clés, utiliser de préférence gpf_wfs_search_types.",
  ].join("\r\n");
  protected outputSchemaShape = gpfWfsListTypesOutputSchema;

  schema = z.object({});

  async execute(input: WfsTypesInput) {
    const featureTypes = await wfsClient.getFeatureTypes();
    return {
      results: featureTypes.map((featureType) => ({
        id: featureType.id,
        title: featureType.title,
        description: featureType.description,
      })),
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

export default GpfWfsListTypesTools;
