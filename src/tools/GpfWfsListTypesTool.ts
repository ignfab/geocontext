import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "./toolAnnotations.js";
import { wfsClient } from "../gpf/wfs.js";

const gpfWfsListTypesInputSchema = z.object({});

type GpfWfsListTypesInput = z.infer<typeof gpfWfsListTypesInputSchema>;

class GpfWfsListTypesTool extends MCPTool<GpfWfsListTypesInput> {
  name = "gpf_wfs_list_types";
  title = "Liste complète des types WFS";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie la liste complète des types WFS de la Géoplateforme (GPF).",
    "Utiliser ce tool pour un inventaire exhaustif ou une exploration globale du catalogue.",
    "Pour trouver rapidement un type pertinent à partir de mots-clés, utiliser de préférence gpf_wfs_search_types.",
  ].join("\r\n");
  schema = gpfWfsListTypesInputSchema;

  async execute(input: GpfWfsListTypesInput) {
    const featureTypes = await wfsClient.getFeatureTypes();
    return featureTypes.map((featureType) => ({
      id: featureType.id,
      title: featureType.title,
      description: featureType.description,
    }));
  }
}

export default GpfWfsListTypesTool;
