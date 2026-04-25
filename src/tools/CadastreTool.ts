/**
 * MCP tool exposing nearby cadastral objects for a given point.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { getParcellaireExpress, PARCELLAIRE_EXPRESS_TYPES, PARCELLAIRE_EXPRESS_SOURCE } from "../gpf/parcellaire-express.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { featureRefSchema, lonSchema, latSchema } from "../helpers/schemas.js";

// --- Schema ---

const cadastreInputSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
}).strict();

// --- Types ---

type CadastreInput = z.infer<typeof cadastreInputSchema>;

const cadastreResultSchema = z
  .object({
    type: z.string().describe(`Le type d'objet cadastral (${PARCELLAIRE_EXPRESS_TYPES.join(", ")}).`),
    id: z.string().describe("L'identifiant de l'objet cadastral."),
    bbox: z.array(z.number()).describe("La boîte englobante de l'objet cadastral.").optional(),
    feature_ref: featureRefSchema.describe("Référence WFS réutilisable, notamment avec `gpf_wfs_get_features` et `spatial_operator = \"intersects_feature\"`."),
    distance: z.number().describe("La distance en mètres entre le point demandé et l'objet cadastral retenu."),
    source: z.string().describe("La source des données cadastrales."),
  })
  .catchall(z.unknown());

const cadastreOutputSchema = z.object({
  results: z.array(cadastreResultSchema).describe("La liste des objets cadastraux les plus proches du point demandé."),
});

// --- Tool ---

class CadastreTool extends BaseTool<CadastreInput> {
  name = "cadastre";
  title = "Informations cadastrales";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    `Renvoie, pour un point donné par sa \`longitude\` et sa \`latitude\`, la liste des objets cadastraux (${PARCELLAIRE_EXPRESS_TYPES.join(", ")}) les plus proches, avec leurs informations associées.`,
    "Les résultats sont retournés au plus une fois par type lorsqu'ils sont disponibles et incluent un `feature_ref` WFS réutilisable.",
    "Le `feature_ref` est directement réutilisable dans `gpf_wfs_get_features` avec `spatial_operator=\"intersects_feature\"`.",
    "La distance de recherche est fixée à 10 mètres.  Si aucun objet n'est trouvé dans les 10 mètres, le résultat est vide.",
    "Pour récupérer exactement l'objet correspondant au `feature_ref`, utiliser `gpf_wfs_get_feature_by_id`.",
    `(source : ${PARCELLAIRE_EXPRESS_SOURCE}).`
  ].join("\n");
  protected outputSchemaShape = cadastreOutputSchema;

  schema = cadastreInputSchema;

  /**
   * Returns the nearest cadastral objects around the requested point.
   *
   * @param input Normalized tool input.
   * @returns The nearest cadastral objects, at most one per cadastral type.
   */
  async execute(input: CadastreInput) {
    return {
      results: await getParcellaireExpress(input.lon, input.lat),
    };
  }
}

export default CadastreTool;
