import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { getAssiettesServitudes, URBANISME_SOURCE } from "../gpf/urbanisme.js";
import logger from "../logger.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";

const assietteSupInputSchema = z.object({
  lon: z
    .number()
    .min(-180)
    .max(180)
    .describe("La longitude du point."),
  lat: z
    .number()
    .min(-90)
    .max(90)
    .describe("La latitude du point."),
}).strict();

type AssietteSupInput = z.infer<typeof assietteSupInputSchema>;

const featureRefSchema = z.object({
  typename: z.string().describe("Le `typename` WFS réutilisable pour une requête ultérieure."),
  feature_id: z.string().describe("L'identifiant WFS réutilisable du feature."),
});

const assietteSupResultSchema = z
  .object({
    type: z.string().describe("Le type d'assiette de servitude d'utilité publique renvoyé."),
    id: z.string().describe("L'identifiant de l'assiette."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'assiette.").optional(),
    feature_ref: featureRefSchema.describe("Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`.").optional(),
    distance: z.number().describe("La distance entre le point demandé et l'assiette retenue."),
  })
  .catchall(z.unknown());

const assietteSupOutputSchema = z.object({
  results: z.array(assietteSupResultSchema).describe("La liste des assiettes de servitudes d'utilité publique pertinentes pour le point demandé."),
});

class AssietteSupTool extends MCPTool<AssietteSupInput> {
  name = "assiette_sup";
  title = "Servitudes d’utilité publique";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = `Renvoie, pour un point donné par sa longitude et sa latitude, la liste des assiettes de servitudes d'utilité publique (SUP) pertinentes à proximité, avec leurs propriétés associées. Les résultats peuvent inclure des assiettes ponctuelles, linéaires ou surfaciques et exposent un \`feature_ref\` WFS réutilisable quand il est disponible. (source : ${URBANISME_SOURCE}).`;
  protected outputSchemaShape = assietteSupOutputSchema;

  schema = assietteSupInputSchema;

  async execute(input: AssietteSupInput) {
    logger.info(`assiette_sup(${input.lon},${input.lat})...`);
    return {
      results: await getAssiettesServitudes(input.lon, input.lat),
    };
  }
}

export default AssietteSupTool;
