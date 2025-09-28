import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { wfsClient } from "../gpf/wfs.js";

interface GpfSearchFeatureTypes {
  query: string;
  max_results: number;
}

class GpfSearchFeatureTypes extends MCPTool<GpfSearchFeatureTypes> {
  name = "gpf_search_feature_types";
  description = [
    "Recherche par mot clé dans la liste des types WFS de la Géoplateforme (GPF). Remarques :",
    "- La recherche est une recherche textuelle simple (mini-search)",
    "- Un LLM peut enrichir la recherche avec des mots clés supplémentaires.",
    "- La recherche est limitée par défaut à 10 résultats",
    "- Le paramètre max_results permet de changer le nombre de résultats (par exemple pour trouver toutes les tables communes ADMINEXPRESS)",
  ].join("\r\n");

  schema = {
    query: {
      type: z.string(),
      description: "La requête de recherche",
    },
    max_results: {
      type: z.number().optional(),
      description: "Le nombre de résultats (10 par défaut)",
    },
  };

  async execute(input: GpfSearchFeatureTypes) {
    const maxResults = input.max_results || 10;
    const featureTypes = await wfsClient.searchFeatureTypes(input.query, maxResults);
    const featureTypeNames = featureTypes.map((featureType) => featureType.name);
    return featureTypeNames;
  }
}

export default GpfSearchFeatureTypes;
