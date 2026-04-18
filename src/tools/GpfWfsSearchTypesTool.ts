import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { wfsClient } from "../gpf/wfs.js";

const gpfWfsSearchTypesInputSchema = z.object({
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
}).strict();

type GpfWfsSearchTypesInput = z.infer<typeof gpfWfsSearchTypesInputSchema>;

const gpfWfsSearchTypeResultSchema = z.object({
  id: z.string().describe("L'identifiant complet du type WFS."),
  title: z.string().describe("Le titre lisible du type WFS."),
  description: z.string().describe("La description du type WFS."),
  score: z.number().describe("Le score de pertinence de la recherche.").optional(),
});

const gpfWfsSearchTypesOutputSchema = z.object({
  results: z.array(gpfWfsSearchTypeResultSchema).describe("La liste ordonnée des types WFS trouvés."),
});

class GpfWfsSearchTypesTool extends MCPTool<GpfWfsSearchTypesInput> {
  name = "gpf_wfs_search_types";
  title = "Recherche de types WFS";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Recherche des types WFS de la Géoplateforme (GPF) à partir de mots-clés afin de trouver un identifiant de type (`typename`) valide.",
    "La recherche est textuelle (mini-search) et retourne une liste ordonnée de candidats avec leur identifiant, leur titre, leur description et un score de pertinence éventuel.",
    "Le paramètre `max_results` permet d'élargir le nombre de candidats retournés (10 par défaut).",
    "**Important** : Utiliser ce tool avant `gpf_wfs_describe_type` ou `gpf_wfs_get_features` lorsque le nom exact du type n'est pas connu.",
    "**Important** : Privilégier des termes métier en français pour la recherche."
  ].join("\n");
  protected outputSchemaShape = gpfWfsSearchTypesOutputSchema;

  schema = gpfWfsSearchTypesInputSchema;

  async execute(input: GpfWfsSearchTypesInput) {
    const maxResults = input.max_results || 10;
    const featureTypes = await wfsClient.searchFeatureTypesWithScores(input.query, maxResults);
    return {
      results: featureTypes.map(({ collection, score }) => ({
        id: collection.id,
        title: collection.title,
        description: collection.description,
        ...(score !== undefined ? { score } : {}),
      })),
    };
  }
}

export default GpfWfsSearchTypesTool;
