import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { getAssiettesServitudes, URBANISME_SOURCE } from "../gpf/urbanisme.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { featureRefSchema, lonSchema, latSchema } from "../helpers/schemas.js";

const assietteSupInputSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
}).strict();

type AssietteSupInput = z.infer<typeof assietteSupInputSchema>;

const assietteSupResultSchema = z
  .object({
    type: z.string().describe("Le type d'assiette de servitude d'utilité publique renvoyé."),
    id: z.string().describe("L'identifiant de l'assiette."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'assiette.").optional(),
    feature_ref: featureRefSchema.describe("Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`.").optional(),
    distance: z.number().describe("La distance en mètres entre le point demandé et l'assiette retenue."),
  })
  .catchall(z.unknown());

const assietteSupOutputSchema = z.object({
  results: z.array(assietteSupResultSchema).describe("La liste des assiettes de servitudes d'utilité publique pertinentes pour le point demandé."),
});

class AssietteSupTool extends MCPTool<AssietteSupInput> {
  name = "assiette_sup";
  title = "Servitudes d’utilité publique";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie, pour un point donné par sa longitude et sa latitude, la liste des assiettes de servitudes d'utilité publique (SUP) pertinentes à proximité, avec leurs propriétés associées.",
    "Une SUP est une contrainte légale sur l'usage du sol liée à un équipement ou une infrastructure publique (ex : AC pour patrimoine, EL pour voirie, PT pour télécoms, I pour installations classées...).",
    "Les résultats peuvent inclure des assiettes ponctuelles, linéaires ou surfaciques et exposent un `feature_ref` WFS réutilisable quand il est disponible.",
    `(source : ${URBANISME_SOURCE}).`
  ].join("\n");
  protected outputSchemaShape = assietteSupOutputSchema;

  schema = assietteSupInputSchema;

  async execute(input: AssietteSupInput) {
    return {
      results: await getAssiettesServitudes(input.lon, input.lat),
    };
  }
}

export default AssietteSupTool;
