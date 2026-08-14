/**
 * MCP tool exposing keyword-based search over the embedded WFS type catalog.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { wfsSchemaStore } from "../wfs/catalog.js";
import type { DetailedCollectionSearchMatch } from "../wfs/catalog.js";
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
  typename: z.string().describe("L'identifiant du type GPF."),
  title: z.string().describe("Le titre lisible du type GPF."),
  description: z.string().describe("La description du type GPF."),
  score: z.number().describe("Le score de pertinence de la recherche.").optional(),
  queryTerms: z.array(z.string()).optional().describe("Les termes de la requête qui ont produit ce résultat."),
  terms: z.array(z.string()).optional().describe("Les termes indexés correspondant à la requête."),
  match: z.object({}).catchall(z.array(z.string())).optional().describe(
    "Détail des correspondances : associe chaque terme indexé aux champs où il a été trouvé.\n" +
    "Champs possibles :\n" +
    "- `namespace` : préfixe du type (ex. \"ADMINEXPRESS-COG.LATEST\", \"BDTOPO_V3\")\n" +
    "- `name` : nom du type (ex. \"commune\", \"departement\")\n" +
    "- `identifierTokens` : identifiant complet décomposé en mots-clés\n" +
    "- `title` : titre lisible du type\n" +
    "- `description` : description détaillée du type\n" +
    "- `propertyNames` : noms des propriétés disponibles (ex. \"numero\", \"section\", \"code_insee\" pour CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle)\n" +
    "- `propertyTitles` : titres des propriétés (ex. \"Superficie cadastrale\", \"Code Insee de la commune\", \"Population\" pour BDTOPO_V3:commune)\n" +
    "- `propertyDescriptions` : descriptions des propriétés (ex. \"Identifiant de l'objet hydrographique.\", \"Précise si le cours d'eau est permanent ou pas.\" pour BDTOPO_V3:cours_d_eau)\n" +
    "- `oneOfConsts` : valeurs énumérées constantes (ex. \"Agricole\", \"Industriel\", \"Résidentiel\" pour BDTOPO_V3:batiment, propriété usage_1)\n" +
    "- `oneOfDescriptions` : descriptions des valeurs énumérées (ex. \"Zone de vignes.\", \"Culture de houblon.\" pour BDTOPO_V3:zone_de_vegetation, propriété nature)\n" +
    "- `representedFeatures` : objets géographiques représentés (ex. \"Piscine découverte\", \"Terrain de rugby\", \"Vélodrome (piste)\" pour BDTOPO_V3:terrain_de_sport)\n" +
    "- `selectionCriteria` : texte libre décrivant les critères de sélection du type (ex. \"Toutes les emprises de parcs et de réserves naturelles nationales ou régionales sont retenues.\" pour BDTOPO_V3:parc_ou_reserve)"
  ),
});

const gpfSearchTypesOutputSchema = z.object({
  results: z.array(gpfSearchTypeResultSchema).describe("La liste ordonnée des types GPF trouvés."),
});

// --- Tool ---

class GpfSearchTypesTool extends BaseTool<GpfSearchTypesInput> {
  name = "gpf_search_types";
  title = "Recherche de types GPF";
  annotations = READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS;
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
    const results = await Promise.all(featureTypes.map(async ({ id, score, queryTerms, terms, match }: DetailedCollectionSearchMatch) => {
      try {
        const featureType = await wfsSchemaStore.getFeatureType(id);
        return {
          typename: id,
          title: featureType.schema.title,
          description: featureType.schema.description,
          score,
          queryTerms,
          terms,
          match,
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          typename: id,
          title: `Erreur: ${message}`,
          description: "Détails du type introuvable à cause d'une erreur de synchronisation du catalogue.",
          score,
          queryTerms,
          terms,
          match,
        };
      }
    }));

    return {
      results,
    };
  }
}

export default GpfSearchTypesTool;
