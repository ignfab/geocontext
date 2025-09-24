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
    const result = await wfsClient.getFeatureType(input.typename);
    if ( result === null ) {
      return `Le type ${input.typename} n'existe pas (utiliser gpf_get_feature_types pour lister les types disponibles)`;
    }
    return result;
  }
}

export default GpfWfsDescribeTypeTool;
