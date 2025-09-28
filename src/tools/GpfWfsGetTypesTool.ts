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
    const featureTypes = await wfsClient.getFeatureTypes();
    const featureTypeNames = featureTypes.map((featureType) => featureType.name);
    return featureTypeNames;
  }
}

export default GpfGetFeatureTypes;
