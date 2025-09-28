import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { wfsClient } from "../gpf/wfs.js";

interface GpfWfsDescribeTypeInput {
  typename: string;
}

class GpfWfsDescribeTypeTool extends MCPTool<GpfWfsDescribeTypeInput> {
  name = "gpf_wfs_describe_type";
  description = [
    "Renvoie la description détaillée d'un type WFS donné par son nom fourni par gpf_wfs_search_types.",
  ].join("\r\n");

  schema = {
    typename: {
      type: z.string(),
      description: "Le nom du type (ex : BDTOPO_V3:batiment)",
    },
  };

  async execute(input: GpfWfsDescribeTypeInput) {
    try {
      const featureType = await wfsClient.getFeatureType(input.typename);
      // remove useless fields outputFormats and otherCrs
      const { outputFormats, otherCrs, ...result } = featureType;
      return result;
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
