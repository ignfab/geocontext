import { MCPTool } from "mcp-framework";
import { z } from "zod";
import { wfsClient } from "../gpf/wfs.js";

interface GpfWfsTypeInput {
  typename: string;
}

class GpfWfsDescribeTypeTool extends MCPTool<GpfWfsTypeInput> {
  name = "gpf_wfs_describe_type";
  description = "Renvoie la description détaillée d'un type WFS.";

  schema = {
    typename: {
      type: z.string(),
      description: "Le nom du type (ex : BDTOPO_V3:batiment)",
    },
  };

  async execute(input: GpfWfsTypeInput) {
    try {
      const result = await wfsClient.getFeatureType(input.typename);
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
