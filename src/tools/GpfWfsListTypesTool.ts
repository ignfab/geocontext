import { MCPTool } from "mcp-framework";

import { wfsClient } from "../gpf/wfs.js";

interface WfsTypesInput {
}

class GpfWfsListTypesTools extends MCPTool<WfsTypesInput> {
  name = "gpf_wfs_list_types";
  description = [
    "Renvoie la liste des types WFS de la Géoplateforme (GPF). ATTENTION :",
    "- Il y a plus de 700 résultats possibles",
    "- Il est conseillé d'utiliser de préférence gpf_wfs_search_types pour filtrer les résultats.",
  ].join("\r\n");

  schema = {
   
  };

  async execute(input: WfsTypesInput) {
    const featureTypes = await wfsClient.getFeatureTypes();
    const featureTypeNames = featureTypes.map((featureType) => featureType.name);
    return featureTypeNames;
  }
}

export default GpfWfsListTypesTools;
