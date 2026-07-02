/**
 * MCP tool exposing keyword-based search over the embedded WFS type catalog.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { wfsSchemaStore } from "../wfs/catalog.js";
import logger from "../logger.js";

// --- Schema ---

const gpfSearchTypesInputSchema = z.object({
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

// --- Types ---

type GpfSearchTypesInput = z.infer<typeof gpfSearchTypesInputSchema>;

const gpfSearchTypeResultSchema = z.object({
  id: z.string().describe("L'identifiant complet du type GPF."),
  title: z.string().describe("Le titre lisible du type GPF."),
  description: z.string().describe("La description du type GPF."),
  score: z.number().describe("Le score de pertinence de la recherche.").optional(),
});

const gpfSearchTypesOutputSchema = z.object({
  results: z.array(gpfSearchTypeResultSchema).describe("La liste ordonnée des types GPF trouvés."),
});

// --- Tool ---

class GpfSearchTypesTool extends BaseTool<GpfSearchTypesInput> {
  name = "gpf_search_types";
  title = "Recherche de types GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Recherche des types de la Géoplateforme (GPF) à partir de mots-clés afin de trouver un identifiant de type (`typename`) valide.",
    "La recherche est textuelle (mini-search) et retourne une liste ordonnée de candidats avec leur identifiant, leur titre, leur description et un score de pertinence éventuel.",
    "Le paramètre `max_results` permet d'élargir le nombre de candidats retournés (10 par défaut).",
    "**Important** : Utiliser ce tool avant `gpf_describe_type` ou `gpf_get_features` lorsque le nom exact du type n'est pas connu.",
    "**Important** : Privilégier des termes métier en français pour la recherche."
  ].join("\n");
  protected outputSchemaShape = gpfSearchTypesOutputSchema;

  schema = gpfSearchTypesInputSchema;

  /**
   * Searches the embedded WFS type catalog from a free-text query.
   *
   * @param input Normalized tool input.
   * @returns The ordered search results, optionally enriched with relevance scores.
   */
  async execute(input: GpfSearchTypesInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    const maxResults = input.max_results || 10;
    const featureTypes = await wfsSchemaStore.searchFeatureTypesWithScores(input.query, maxResults);
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

export default GpfSearchTypesTool;
