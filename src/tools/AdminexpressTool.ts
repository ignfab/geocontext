import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { getAdminUnits, ADMINEXPRESS_TYPES, ADMINEXPRESS_SOURCE } from "../gpf/adminexpress.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { featureRefSchema, lonSchema, latSchema } from "../helpers/schemas.js";

const adminexpressInputSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
}).strict();

type AdminexpressInput = z.infer<typeof adminexpressInputSchema>;

const adminexpressResultSchema = z
  .object({
    type: z.string().describe(`Le type d'unité administrative (${ADMINEXPRESS_TYPES.join(", ")}).`),
    id: z.string().describe("L'identifiant de l'unité administrative."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'unité administrative.").optional(),
    feature_ref: featureRefSchema.describe("Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`."),
  })
  .catchall(z.unknown());

const adminexpressOutputSchema = z.object({
  results: z.array(adminexpressResultSchema).describe("La liste des unités administratives couvrant le point demandé."),
});

class AdminexpressTool extends MCPTool<AdminexpressInput> {
  name = "adminexpress";
  title = "Unités administratives";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    `Renvoie, pour un point donné par sa \`longitude\` et sa \`latitude\`, la liste des unités administratives (${ADMINEXPRESS_TYPES.join(", ")}) qui le couvrent, sous forme d'objets typés contenant leurs propriétés administratives.`,
    "Les résultats incluent un `feature_ref` WFS réutilisable. Les propriétés incluent notamment le code INSEE.",
    "Le `feature_ref` de chaque unité administrative est directement réutilisable dans `gpf_wfs_get_features` avec `spatial_operator=\"intersects_feature\"` pour interroger des données sur cette emprise.",
    `(source : ${ADMINEXPRESS_SOURCE}).`
  ].join("\n");
  protected outputSchemaShape = adminexpressOutputSchema;

  schema = adminexpressInputSchema;

  async execute(input: AdminexpressInput) {
    return {
      results: await getAdminUnits(input.lon, input.lat),
    };
  }
}

export default AdminexpressTool;
