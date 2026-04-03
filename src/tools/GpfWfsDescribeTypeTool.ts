import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { wfsClient } from "../gpf/wfs.js";

interface GpfWfsDescribeTypeInput {
  typename: string;
}

class GpfWfsDescribeTypeTool extends MCPTool<GpfWfsDescribeTypeInput> {
  name = "gpf_wfs_describe_type";
  description = [
    "Renvoie la description détaillée d'un type WFS (propriétés, géométrie, valeurs possibles) à partir de son nom fourni par gpf_wfs_search_types.",
    "NB : gpf_wfs_search_types renvoie déjà le titre et la description du type ; utiliser cet outil uniquement pour obtenir la liste des propriétés.",
  ].join("\r\n");

  schema = {
    typename: {
      type: z.string(),
      description: "Le nom du type (ex : BDTOPO_V3:batiment)",
    },
  };

  async execute(input: GpfWfsDescribeTypeInput) {
    try {
      return await wfsClient.getFeatureType(input.typename);
    }catch(e){
      return {
        type: "error",
        message: e.message,
        help: `Utiliser gpf_get_feature_types pour trouver les types disponibles`
      }
    }
  }
}

export default GpfWfsDescribeTypeTool;
