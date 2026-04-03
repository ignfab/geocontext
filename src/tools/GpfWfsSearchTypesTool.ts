import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { wfsClient } from "../gpf/wfs.js";

const gpfWfsSearchTypeResultSchema = z.object({
  id: z.string().describe("L'identifiant complet du type WFS."),
  title: z.string().describe("Le titre lisible du type WFS."),
  description: z.string().describe("La description du type WFS."),
});

const gpfWfsSearchTypesOutputSchema = z.object({
  results: z.array(gpfWfsSearchTypeResultSchema).describe("La liste ordonnée des types WFS trouvés."),
});

interface GpfWfsSearchTypesInput {
  query: string;
  max_results?: number;
}

class GpfWfsSearchTypesTool extends MCPTool<GpfWfsSearchTypesInput> {
  name = "gpf_wfs_search_types";
  title = "Recherche de types WFS";
  description = [
    "Recherche des types WFS de la Géoplateforme (GPF) à partir de mots-clés afin de trouver un identifiant de type (`typename`) valide.",
    "Utiliser ce tool avant `gpf_wfs_describe_type` ou `gpf_wfs_get_features` lorsque le nom exact du type n'est pas connu.",
    "La recherche est textuelle (mini-search) et retourne une liste ordonnée de candidats avec leur identifiant, leur titre et leur description.",
    "Le paramètre `max_results` permet d'élargir le nombre de candidats retournés (10 par défaut).",
  ].join("\r\n");
  protected outputSchemaShape = gpfWfsSearchTypesOutputSchema;

  schema = z.object({
    query: z
      .string()
      .trim()
      .min(1, "la requête de recherche ne doit pas être vide")
      .describe("La requête de recherche"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Le nombre maximum de résultats à retourner (entre 1 et 50). Défaut : 10."),
  });

  async execute(input: GpfWfsSearchTypesInput) {
    const maxResults = input.max_results || 10;
    const featureTypes = await wfsClient.searchFeatureTypes(input.query, maxResults);
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

export default GpfWfsSearchTypesTool;
