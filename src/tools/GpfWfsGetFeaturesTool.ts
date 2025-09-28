import { logger, MCPTool } from "mcp-framework";
import { z } from "zod";
import { GPF_WFS_URL } from "../gpf/wfs.js";
import { fetchJSON } from "../helpers/http.js";

interface GpfWfsGetFeaturesInput {
  typename: string;
  property_names?: string[];
  count?: number;
  sort_by?: string;
  cql_filter?: string;
  result_type?: 'results' | 'hits' | 'url';
}

class GpfWfsGetFeaturesTool extends MCPTool<GpfWfsGetFeaturesInput> {
  name = "gpf_wfs_get_features";
  description = "Permet de récupérer les objets pour un type WFS.";

  schema = {
    typename: {
      type: z.string(),
      description: "Le nom du type (ex : BDTOPO_V3:batiment). Important : Utiliser gpf_wfs_search_types pour trouver les types disponibles."
    },
    property_names: {
      type: z.array(z.string()).optional(),
      description: 'La liste des propriétés (ex : [code_insee,nom_officiel,geometrie]). NB : adapter geometrie avec geometryName au niveau du type WFS. '
    },
    sort_by: {
      type: z.string().optional(),
      description: 'Trier selon une propriété (syntaxe : field1 [A|D], field2 [A|D], ... , fieldN [A|D])'
    },
    count: {
      type: z.number().optional(),
      description: "Le nombre d'objets à récupérer (ex : 10)"
    },
    cql_filter: {
      type: z.string().optional(),
      description: "Le filtre au format cql_filter de GeoServer. ATTENTION : il faut permuter les coordonnées pour EPSG:4326 (ex : 'DWITHIN(geom,Point(${lat} ${lon}),10,meters)')"
    },
    result_type: {
      type: z.enum(['results', 'hits', 'url']).optional(),
      description: [
        "Type de résultat : ",
        "- 'results' pour les données complètes (défaut)",
        "- 'hits' pour le comptage uniquement",
        "- 'url' pour récupérer l'URL de la requête (ex : affichage des données côté client dans une carte)"
      ].join("\r\n")
    }
  };

  async execute(input: GpfWfsGetFeaturesInput) {
    const params : any = {
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
      params.count = input.count;
    }
    if (input.sort_by) {
      params.sortBy = input.sort_by;
    }
    if (input.property_names) {
      params.propertyName = input.property_names.join(',');
    }
    
    // Si result_type est 'hits', on utilise count=1 pour récupérer juste le totalFeatures
    if (input.result_type === 'hits') {
      params.count = 1;
      // On n'a pas besoin des propriétés détaillées pour un comptage
      delete params.propertyName;
    }
    

    const url = `${GPF_WFS_URL}?` + new URLSearchParams(params).toString();
    logger.info(`[gpf_wfs_get_features] ${url}`);

    if ( input.result_type === 'url' ) {
      return url;
    }

    try {
      const featureCollection = await fetchJSON(url);
      
      // Si result_type est 'hits', on retourne juste le comptage
      if (input.result_type === 'hits') {
        return featureCollection.totalFeatures;
      }

      return featureCollection;
    }catch(e){
      logger.error(`[gpf_wfs_get_features] ${e}`);
      return {
        type: "error",
        message: "Une erreur est survenue lors de la récupération des objets (utiliser gpf_wfs_describe_type pour lister les types disponibles avant d'appeler gpf_wfs_get_features)",
        details: `${e}`
      }
    }
  }
}

export default GpfWfsGetFeaturesTool;
