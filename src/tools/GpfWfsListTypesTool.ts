import { MCPTool } from "mcp-framework";

import { wfsClient } from "../gpf/wfs.js";

interface WfsTypesInput {}

class GpfWfsListTypesTools extends MCPTool<WfsTypesInput> {
  name = "gpf_wfs_list_types";
  title = "Liste complète des types WFS";
  description = [
    "Renvoie la liste complète des types WFS de la Géoplateforme (GPF).",
    "Utiliser ce tool pour un inventaire exhaustif ou une exploration globale du catalogue.",
    "Pour trouver rapidement un type pertinent à partir de mots-clés, utiliser de préférence gpf_wfs_search_types.",
  ].join("\r\n");
  schema = {};

  async execute(input: WfsTypesInput) {
    const featureTypes = await wfsClient.getFeatureTypes();
    return featureTypes.map((featureType) => ({
      id: featureType.id,
      title: featureType.title,
      description: featureType.description,
    }));
  }
}

export default GpfWfsListTypesTools;
