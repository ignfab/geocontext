/**
 * MCP tool exposing a summarized schema for a single WFS type.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import type { OgcCollectionPropertyEnumValue } from "@ignfab/gpf-schema-store";
import { type GpfFeatureType, wfsSchemaStore } from "../wfs/catalog.js";
import { READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import logger from "../logger.js";
import { getGeometryName, getGeometryProperties } from "../wfs/properties.js";

// --- Schemas ---

const gpfDescribeTypeInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Le nom du type à décrire (de la forme `prefixe:nom`)."),
}).strict();

const gpfPropertySchema = z.object({
  name: z.string().describe("Le nom de la propriété."),
  description: z.string().optional().describe("La description de la propriété."),
  oneOf: z.array(z.string()).optional().describe("La liste des valeurs possibles, si elle existe.")
});

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

const gpfDescribeTypeOutputSchema = z.object({
  typename: z.string().describe("L'identifiant du type (de la forme `prefixe:nom`)."),
  url: z.string().url().describe("Le lien vers le schéma complet du type, à ne télécharger que lorsque le résumé fourni par `gpf_describe_type` est insuffisant."),
  description: z.string().optional().describe("La description du contenu du type."),
  geometry_kind: z.enum(ogcGeometryKind).optional().describe("Le type de la géométrie, si elle existe. Cela peut être un type GeoJSON en minuscules, une union comme \"point-or-multipoint\" ou encore \"any\". Ce champ est indéfini lorsque le schéma n'a pas de propriété géométrique."),
  properties: z.array(gpfPropertySchema).describe("La liste des propriétés non-géométriques du schéma."),
  required: z.array(z.string()).describe("La liste des propriétés non-géométriques toujours présentes. Toute propriété qui n'est pas dans cette liste est donc facultative."),
  selection_criteria: z.string().optional().describe("Les critères de sélection des objets enregistrés dans ce type."),
});

// --- Types ---

type GpfDescribeTypeInput = z.infer<typeof gpfDescribeTypeInputSchema>;
type GpfDescribeTypeOutput = z.infer<typeof gpfDescribeTypeOutputSchema>;

// --- Utility ---

function summarizeSchema(featureType: GpfFeatureType) : GpfDescribeTypeOutput {
  const schema = featureType.schema;
  const geometricPropertyNames = getGeometryProperties(featureType);
  const geometryName = geometricPropertyNames.length > 0 ? getGeometryName(featureType) : undefined;
  const format = geometryName ? schema.properties[geometryName].format : undefined;
  const kind = format?.replace(/^geometry-/, "");
  const shortProperties = Object.keys(schema.properties)
    .filter(name => !geometricPropertyNames.includes(name))
    .map(name => {
      const property = schema.properties[name];
      return {
        name,
        description: property.description,
        oneOf: property.oneOf?.map((v: OgcCollectionPropertyEnumValue) => v.const),
      };
    });
  const required = schema.required.filter(
    (name: string) => !geometricPropertyNames.includes(name),
  );

  return {
    typename: featureType.typename,
    url: schema.$id,
    description: schema.description,
    geometry_kind: ogcGeometryKind.find(k => k === kind),
    properties: shortProperties,
    required,
    selection_criteria: schema["x-ign-selectionCriteria"],
  };
}

// --- Tool ---

const GPF_DESCRIBE_TYPE_TOOL_DESCRIPTION = [
  "Renvoie un résumé du schéma d'un type GPF à partir de son identifiant (`typename`).",
  "Ce schéma contient notamment la description du type et un champ `properties` qui recense la liste des propriétés avec leur description et la liste de leurs valeurs possibles (`oneOf`) lorsqu'elle est fixée.",
  "Le schéma caractérise aussi la nature de la géométrie des objets du type par le champ `geometry_kind`, à mettre en lien avec les `spatial_extras` calculables dans `gpf_get_features` et `gpf_get_feature_by_id`.",
  "Utiliser ce tool après `gpf_search_types` pour inspecter les propriétés disponibles avant d'appeler `gpf_get_features`. Si le résumé ne suffit pas, télécharger le schéma complet via l'`url` renvoyée.",
  "**IMPORTANT : Appel fortement recommandé si les noms exacts des propriétés ne sont pas connus : un nom de propriété incorrect provoque une erreur**."
].join("\n");

class GpfDescribeTypeTool extends BaseTool<GpfDescribeTypeInput> {
  name = "gpf_describe_type";
  title = "Description d’un type GPF";
  annotations = READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS;
  description = GPF_DESCRIBE_TYPE_TOOL_DESCRIPTION;
  protected outputSchemaShape = gpfDescribeTypeOutputSchema;

  schema = gpfDescribeTypeInputSchema;

  /**
   * Formats the summary payload into both text content and structuredContent.
   *
   * @param data Raw execution result.
   * @returns An MCP success response with validated output shape.
   */
  protected createSuccessResponse(data: unknown) {
    const payload = gpfDescribeTypeOutputSchema.parse(data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  /**
   * Loads and summarizes the schema description for one GPF typename.
   *
   * @param input Normalized tool input.
   * @returns The summarized feature type description from the embedded catalog.
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
