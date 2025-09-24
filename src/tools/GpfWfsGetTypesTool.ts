import { MCPTool } from "mcp-framework";

import { wfsClient } from "../gpf/wfs.js";

interface WfsTypesInput {
}

class GpfGetFeatureTypes extends MCPTool<WfsTypesInput> {
  name = "gpf_get_feature_types";
  description = "Renvoie la liste des types WFS de la Géoplateforme (GPF)";

  schema = {
   
  };

  async execute(input: WfsTypesInput) {
    return wfsClient.getFeatureTypes();
  }
}

export default GpfGetFeatureTypes;
