/**
 * MCP tool exposing reverse geocoding for points of interest.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import { pointsdinteretClient, POINTSDINTERET_SOURCE } from "../gpf/pointsdinteret.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import { lonSchema, latSchema } from "../helpers/schemas.js";
import logger from "../logger.js";

// --- Schema ---

const pointsdinteretInputSchema = z.object({
  lon: lonSchema,
  lat: latSchema,
  maximumResponses: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Le nombre maximum de résultats à retourner (entre 1 et 50). Défaut : 3."),
}).strict();

// --- Types ---

type PointsDInteretInput = z.infer<typeof pointsdinteretInputSchema>;

const pointsdinteretResultSchema = z
  .object({
    name: z.string().describe("Le nom du point d'intérêt trouvé"),
    categories: z.array(z.string()).describe("Ses catégories"),
    city: z.string().optional().describe("Sa ville"),
    zipcode: z.string().optional().describe("Son code postal"),
    distance: z.number().describe("La distance en mètres entre le point demandé et le point d'intérêt retenu"),
    centroid: z.object({
      lon: lonSchema,
      lat: latSchema
    }).optional().describe("Les coordonnées du centre du point d'intérêt")
})
.catchall(z.unknown());

const pointsdinteretOutputSchema = z.object({
  results: z.array(pointsdinteretResultSchema).describe("La liste des points d'intérêt à proximité, ordonnée par distance."),
});

// --- Tool ---

class PointsDInteretTool extends BaseTool<PointsDInteretInput> {
  name = "pointsdinteret";
  title = "Points d'intérêt obtenus par géocodage inverse";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie les points d'intérêt les plus proches des coordonnées en entrée.",
    "Le champ `name` contient le nom du point d'intérêt et le champ `categories` liste ses classifications.",
    "Chaque résultat peut aussi inclure les coordonnées du point d'intérêt (`centroid`), sa distance aux coordonnées de départ (`distance`), ainsi que des informations de localisation (`city`, `zipcode`).",
    "Les réultats sont classés par distance, puis par importance : utilisez des coordonnées précises et montez la valeur de `maximumResponses` si l'information ne semble pas assez pertinente.",
    "Pour obtenir un résultat plus détaillé sur un point d'intérêt trouvé, appelez ensuite `wfs_search_types` avec des éléments pertinents de `category`, puis `wfs_get_features` avec le `typename` obtenu et les coordonnées du centroïde.",
    `(source : ${POINTSDINTERET_SOURCE}).`
  ].join("\n");
  protected outputSchemaShape = pointsdinteretOutputSchema;

  schema = pointsdinteretInputSchema;

  /**
   * Returns the points of interest relevant to the requested point.
   *
   * @param input Normalized tool input.
   * @returns The relevant points of interest.
   */
  async execute(input: PointsDInteretInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });
  
    return {
      results: await pointsdinteretClient.pointsdinteret(input.lon, input.lat, input.maximumResponses),
    };
  }
}

export default PointsDInteretTool;
