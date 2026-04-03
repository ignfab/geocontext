import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { GPF_WFS_URL } from "../gpf/wfs.js";
import { fetchJSON } from "../helpers/http.js";
import logger from "../logger.js";

const gpfWfsGetFeaturesHitsOutputSchema = z.object({
  result_type: z.literal("hits").describe("Indique que la réponse contient uniquement un comptage."),
  totalFeatures: z.number().describe("Le nombre total d'objets correspondant à la requête."),
});

const gpfWfsGetFeaturesUrlOutputSchema = z.object({
  result_type: z.literal("url").describe("Indique que la réponse contient uniquement l'URL de la requête."),
  url: z.string().describe("L'URL WFS générée pour la requête."),
});

interface GpfWfsGetFeaturesInput {
  typename: string;
  property_names?: string;
  count?: number;
  sort_by?: string;
  cql_filter?: string;
  result_type?: 'results' | 'hits' | 'url';
}

class GpfWfsGetFeaturesTool extends MCPTool<GpfWfsGetFeaturesInput> {
  name = "gpf_wfs_get_features";
  title = "Lecture d’objets WFS";
  description = [
    "Récupère les objets d'un type WFS à partir d'un `typename` valide, avec filtres, tri et sélection de propriétés optionnels.",
    "Exécute une requête WFS sur un type connu (`typename`) et renvoie soit les objets trouvés, soit leur nombre total, soit l'URL WFS correspondante.",
    "Utiliser `gpf_wfs_search_types` puis `gpf_wfs_describe_type` avant ce tool lorsque le type ou ses propriétés ne sont pas connus.",
    "Le paramètre `result_type` permet de récupérer soit les données complètes (`results`), soit uniquement le comptage (`hits`), soit l'URL WFS générée (`url`).",
    "Les paramètres optionnels permettent de filtrer, trier ou restreindre les champs et le nombre d'objets renvoyés.", 
  ].join("\r\n");

  schema = z.object({
    typename: z
      .string()
      .trim()
      .min(1, "le nom du type ne doit pas être vide")
      .describe("L'identifiant exact du type WFS à interroger (ex : `BDTOPO_V3:batiment`). Ce paramètre détermine la collection interrogée et doit correspondre à un type valide. Utiliser `gpf_wfs_search_types` pour trouver un `typename` pertinent, puis `gpf_wfs_describe_type` pour inspecter ses propriétés avant la requête."),
    property_names: z
      .string()
      .optional()
      .describe("La liste des propriétés à inclure dans chaque objet renvoyé, séparées par des virgules (ex : \"code_insee,nom_officiel,geometrie\"). Ce paramètre limite les champs présents dans la réponse, sans filtrer les objets eux-mêmes. Les noms doivent correspondre exactement aux propriétés du type WFS ; utiliser `gpf_wfs_describe_type` pour les connaître."),
    sort_by: z
      .string()
      .optional()
      .describe("Les propriétés à utiliser pour trier les objets renvoyés, avec la syntaxe `field [A|D]` où `A` signifie tri ascendant et `D` tri descendant. Plusieurs critères peuvent être séparés par des virgules (ex : `nom_officiel A, population D`). Les noms doivent correspondre exactement aux propriétés du type WFS ; utiliser `gpf_wfs_describe_type` pour les connaître."),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Le nombre maximum d'objets à retourner dans la réponse (entre 1 et 1000). Ce paramètre limite les résultats renvoyés, sans modifier le nombre total d'objets correspondant à la requête. Il est surtout utile avec `result_type=\"results\"`."),
    cql_filter: z
      .string()
      .optional()
      .describe([
        "Un filtre `cql_filter` GeoServer pour restreindre les objets renvoyés par la requête.",
        "Il faut utiliser les noms exacts des propriétés du type WFS ; utiliser `gpf_wfs_describe_type` pour les connaître.",
        "Attention : en `EPSG:4326`, les coordonnées des géométries doivent être exprimées en `lat lon` (y x), y compris pour les points, lignes et polygones.",
        "Exemples :",
        "- filtre attributaire : `code_insee = '75056'`",
        "- filtre spatial point : `DWITHIN(geom,Point(48.8566 2.3522),100,meters)`",
        "- filtre spatial polygone : `INTERSECTS(geom,POLYGON((48.85 2.34,48.86 2.34,48.86 2.36,48.85 2.36,48.85 2.34)))`",
      ].join("\r\n")),
    result_type: z
      .enum(["results", "hits", "url"])
      .optional()
      .describe([
        "Choisit le type de résultat renvoyé par le tool :",
        "- `results` : retourne les objets trouvés sous forme de `FeatureCollection` GeoJSON complète (défaut)",
        "- `hits` : retourne uniquement le nombre total d'objets correspondant à la requête",
        "- `url` : retourne uniquement l'URL WFS construite pour la requête, utile pour inspection, débogage ou réutilisation côté client",
      ].join("\r\n"))
  });

  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "hits" &&
      "totalFeatures" in data &&
      typeof data.totalFeatures === "number"
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.totalFeatures),
          },
        ],
        structuredContent: gpfWfsGetFeaturesHitsOutputSchema.parse(data),
      };
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "result_type" in data &&
      data.result_type === "url" &&
      "url" in data &&
      typeof data.url === "string"
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: data.url,
          },
        ],
        structuredContent: gpfWfsGetFeaturesUrlOutputSchema.parse(data),
      };
    }

    return super.createSuccessResponse(data);
  }

  async execute(input: GpfWfsGetFeaturesInput) {
    const params: Record<string, string> = {
      service: 'WFS',
      request: 'GetFeature',
      typeName: input.typename,
      outputFormat: 'application/json'
    };
    
    // Only add optional parameters if they are defined
    if (input.cql_filter) {
      params.cql_filter = input.cql_filter;
    }
    if (input.count) {
      params.count = String(input.count);
    }
    if (input.sort_by) {
      params.sortBy = input.sort_by;
    }
    if (input.property_names && input.property_names.length > 0) {
      params.propertyName = input.property_names;
    }

    // Si result_type est 'hits', on utilise count=1 pour récupérer juste le totalFeatures
    // On fait cela parce que geoserver ne renvoie pas de json avec resultType=hits
    // il faut quand même faire une requete getfeature pour récupérer le totalFeatures...
    if (input.result_type === 'hits') {
      params.count = "1";
      // On n'a pas besoin des propriétés détaillées pour un comptage
      delete params.propertyName;
    }
    

    const url = `${GPF_WFS_URL}?` + new URLSearchParams(params).toString();
    logger.info(`[gpf_wfs_get_features] ${url}`);

    if ( input.result_type === 'url' ) {
      return {
        result_type: "url" as const,
        url,
      };
    }

    const featureCollection = await fetchJSON(url);
    
    if (input.result_type === 'hits') {
      if (typeof featureCollection?.totalFeatures !== "number") {
        throw new Error("Le service WFS n'a pas retourné de comptage exploitable");
      }
      return {
        result_type: "hits" as const,
        totalFeatures: featureCollection.totalFeatures,
      };
    }

    return featureCollection;
  }
}

export default GpfWfsGetFeaturesTool;
