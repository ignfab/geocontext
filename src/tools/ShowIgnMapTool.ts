import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { MCPTool } from "mcp-framework";
import { z } from "zod";

import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import logger from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WMTS_LAYER = "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2";
const DATA_GEOPF_HOST = "data.geopf.fr";

const showIgnMapInputSchema = z.object({
  geojsonUrl: z
    .string()
    .trim()
    .url("l'URL GeoJSON doit être une URL absolue valide")
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === DATA_GEOPF_HOST;
    }, "l'URL GeoJSON doit cibler https://data.geopf.fr")
    .optional()
    .describe("Une URL GeoJSON publique sur `https://data.geopf.fr`, par exemple l'URL renvoyée par `gpf_wfs_get_features` avec `result_type=\"url\"`."),
  title: z
    .string()
    .trim()
    .min(1, "le titre ne doit pas être vide")
    .max(120, "le titre ne doit pas dépasser 120 caractères")
    .optional()
    .describe("Le titre optionnel à afficher au-dessus de la carte."),
});

type ShowIgnMapInput = z.infer<typeof showIgnMapInputSchema>;

const showIgnMapOutputSchema = z.object({
  message: z.string().describe("Un message court décrivant l’état de préparation de la carte."),
  title: z.string().describe("Le titre effectif affiché par défaut dans l’interface."),
  geojsonUrl: z.string().describe("L'URL GeoJSON transmise à l’interface, si présente.").optional(),
  basemapLayer: z.string().describe("L'identifiant de la couche WMTS IGN utilisée en fond de carte."),
});

class ShowIgnMapTool extends MCPTool<ShowIgnMapInput> {
  name = "show_ign_map";
  title = "Carte IGN";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Affiche une carte IGN interactive avec le fond WMTS Plan IGN v2.",
    "Si `geojsonUrl` est fournie, l’interface charge et affiche le GeoJSON depuis `https://data.geopf.fr`.",
    "Ce tool est conçu pour être chaîné après `gpf_wfs_get_features` avec `result_type=\"url\"`.",
  ].join("\n");
  protected outputSchemaShape = showIgnMapOutputSchema;

  schema = showIgnMapInputSchema;

  app = {
    resourceUri: "ui://show-ign-map/view",
    resourceName: "Carte IGN",
    resourceDescription: "Carte IGN interactive avec overlay GeoJSON provenant de data.geopf.fr",
    content: async () => readFile(join(__dirname, "../app-views/show-ign-map/index.html"), "utf-8"),
    csp: {
      connectDomains: ["https://data.geopf.fr"],
      resourceDomains: ["https://data.geopf.fr"],
    },
    prefersBorder: true,
  };

  async execute(input: ShowIgnMapInput) {
    const title = input.title ?? "Carte IGN";
    logger.info(`show_ign_map(${input.geojsonUrl ?? "no-geojson"})...`);

    return {
      message: input.geojsonUrl
        ? "Carte IGN prête avec overlay GeoJSON distant"
        : "Carte IGN prête sans overlay GeoJSON",
      title,
      geojsonUrl: input.geojsonUrl,
      basemapLayer: WMTS_LAYER,
    };
  }
}

export default ShowIgnMapTool;
