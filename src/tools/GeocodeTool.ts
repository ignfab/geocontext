import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { geocode, GEOCODE_SOURCE } from "../gpf/geocode.js";
import logger from "../logger.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "./toolAnnotations.js";

const geocodeInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "le texte ne doit pas être vide")
    .describe("Le texte devant être completé et géocodé"),
  maximumResponses: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Le nombre maximum de résultats à retourner (entre 1 et 10). Défaut : 3."),
});

type GeocodeInput = z.infer<typeof geocodeInputSchema>;

const geocodeResultSchema = z.object({
  lon: z.number().describe("La longitude du résultat."),
  lat: z.number().describe("La latitude du résultat."),
  fulltext: z.string().describe("Le libellé complet du résultat."),
  kind: z.string().describe("La nature du résultat géocodé.").optional(),
  city: z.string().describe("La commune du résultat.").optional(),
  zipcode: z.string().describe("Le code postal du résultat.").optional(),
});

const geocodeOutputSchema = z.object({
  results: z.array(geocodeResultSchema).describe("La liste ordonnée des résultats géocodés."),
});

class GeocodeTool extends MCPTool<GeocodeInput> {
  name = "geocode";
  title = "Géocodage de lieux et d’adresses";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = `Renvoie des résultats d'autocomplétion géocodés à partir d'un texte libre (lieu, adresse, POI), avec coordonnées, libellé complet et informations de localisation (kind, city, zipcode). (source : ${GEOCODE_SOURCE}).`;
  protected outputSchemaShape = geocodeOutputSchema;

  schema = geocodeInputSchema;

  async execute(input: GeocodeInput) {
    logger.info(`geocode(${input.text}, ${input.maximumResponses ?? 3})...`);
    return {
      results: await geocode(input.text, input.maximumResponses),
    };
  }
}

export default GeocodeTool;
