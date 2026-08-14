/**
 * MCP tool exposing detailed schema inspection for a single WFS type.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import type { OgcCollectionPropertyEnumValue } from "@ignfab/gpf-schema-store";
import { GpfFeatureType, wfsSchemaStore } from "../wfs/catalog.js";
import { READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import logger from "../logger.js";
import { getGeometryProperties } from "../wfs/properties.js";

// --- Schema ---

const gpfDescribeTypeInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Le nom du type à décrire (de la forme `prefixe:nom`)."),
}).strict();

const gpfPropertySchema = z.object({
  name: z.string().describe("Le nom de la propriété."),
  description_cut: z.string().max(101).optional().describe("La description de la propriété, tronquée à 100 caractères (terminaison si troncature : …)."),
  oneOf: z.array(z.string()).optional().describe("La liste des valeurs possibles, si elle existe.")
})

const ogcGeometryKind = [
  "point",
  "multipoint",
  "point-or-multipoint",
  "linestring",
  "multilinestring",
  "linestring-or-multilinestring",
  "polygon",
  "multipolygon",
  "polygon-or-multipolygon",
  "geometrycollection",
  "any"
] as const;

const gpfDescribeTypeOutput = z.object({
  typename: z.string().describe("L'identifiant du type (de la forme `prefixe:nom`)."),
  url: z.string().url().describe("Le lien vers le schéma complet du type. Pour des recherches simples, gpf_describe_type et gpf_describe_type_details suffisent, ne télécharge le schéma complet que lorsque les résultats ne sont pas satisfaisants."),
  description: z.string().optional().describe("La description du contenu du type."),
  geometry_kind: z.enum(ogcGeometryKind).optional().describe("Le type de la géométrie, si elle existe. Cela peut être un type GeoJSON en minuscules, une union comme \"point-or-multipoint\" ou encore \"any\". Ce champ est indéfini lorsque le schéma n'a pas de propriété géométrique.\n Note : si tu as besoin d'une propriété géométrique dans une requête, utilise `spatial_extra` si c'est possible ; sinon, utilise un tool `_layer` pour télécharger la géométrie."),
  properties: z.array(gpfPropertySchema).describe("La liste des propriétés non géométriques du schéma, avec un début de description. Utilise gpf_describe_type_details pour avoir plus d'information sur des propriétés choisies, incluant la description complète de la propriété, de son type et de ses valeurs possibles."),
})

// --- Types ---

type GpfDescribeTypeInput = z.infer<typeof gpfDescribeTypeInputSchema>;
type GpfDescribeTypeOutput = z.infer<typeof gpfDescribeTypeOutput>;

// --- Utility ---

function truncateDescription(s: string, len: number) {
   if (s.length > len) {
      return s.substring(0, len) + "…";
   }
   return s;
}

function summarizeSchema(featureType: GpfFeatureType) : GpfDescribeTypeOutput {
  const schema = featureType.schema;
  const geometricPropertyNames = getGeometryProperties(featureType);
  const mainGeometries = geometricPropertyNames.length < 2 ? geometricPropertyNames :
    geometricPropertyNames.filter((s : string) => schema.properties[s]["x-ogc-role"] == "primary-geometry");
  const geometry_kind = mainGeometries.length == 0 ? undefined : schema.properties[mainGeometries[0]].format;
  const shortProperties = Object.keys(schema.properties)
    .filter((name: string) => !geometricPropertyNames.includes(name))
    .map((name: string) => {
      const property = schema.properties[name];
      const description_cut = property.description ? truncateDescription(property.description, 100) : undefined
      return {
        name,
        description_cut,
        oneOf: property.oneOf?.map((v: OgcCollectionPropertyEnumValue) => v.const),
      };
    });

  return {
    typename: featureType.typename,
    url: schema["$id"],
    description: schema.description,
    geometry_kind: geometry_kind?.slice(9) as GpfDescribeTypeOutput["geometry_kind"],
    properties: shortProperties,
  };
}

// --- Tool ---

class GpfDescribeTypeTool extends BaseTool<GpfDescribeTypeInput> {
  name = "gpf_describe_type";
  title = "Description d’un type GPF";
  annotations = READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie un résumé du schéma d'un type GPF à partir de son identifiant (`typename`).",
    "Ce schéma contient notamment la description du type et un champ `properties` qui recense la liste des propriétés avec un début de description et la liste des ses valeurs possibles (`oneOf`) lorsqu'elle est fixée.",
    "Utiliser ce tool après `gpf_search_types` pour inspecter les propriétés disponibles. Utilise ensuite `gpf_describe_type_details` pour comprendre vraiment ce que signifient les propriétés qui t'intéressent, avant d'appeler `gpf_get_features`.",
    "**IMPORTANT : Appel fortement recommandé si les noms exacts des propriétés ne sont pas connus : un nom de propriété incorrect provoque une erreur**."
  ].join("\n");
  protected outputSchemaShape = gpfDescribeTypeOutput;

  schema = gpfDescribeTypeInputSchema;

  /**
   * Formats the summary payload into both text content and structuredContent.
   *
   * @param data Raw execution result.
   * @returns An MCP success response with validated output shape.
   */
  protected createSuccessResponse(data: unknown) {
    const payload = gpfDescribeTypeOutput.parse(data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  /**
   * Loads the detailed schema description for one GPF typename.
   *
   * @param input Normalized tool input.
   * @returns The detailed feature type description from the embedded catalog.
   */
  async execute(input: GpfDescribeTypeInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    try {
      const featureType = await wfsSchemaStore.getFeatureType(input.typename);
      return summarizeSchema(featureType);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message}. Utiliser gpf_search_types pour trouver un type valide.`);
    }
  }
}

export default GpfDescribeTypeTool;
